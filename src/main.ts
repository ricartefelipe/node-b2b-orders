import './shared/tracing/tracing';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { collectDefaultMetrics } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';

import helmet from '@fastify/helmet';

import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { ProblemDetailsFilter } from './shared/filters/problem-details.filter';

async function bootstrap() {
  collectDefaultMetrics();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const corsOrigins = process.env.CORS_ORIGINS;
  if (process.env.NODE_ENV === 'production' && !corsOrigins) {
    throw new Error('CORS_ORIGINS environment variable is required in production (comma-separated)');
  }
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : '*',
    credentials: true,
  });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const config = new DocumentBuilder()
    .setTitle('node-b2b-orders')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  const redis = app.get(RedisService);
  const prisma = app.get(PrismaService);
  const fastify = app.getHttpAdapter().getInstance();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try { await redis.raw.quit(); } catch { /* ignore */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  fastify.addHook('onRequest', async (req: any, reply: any) => {
    const cid = req.headers['x-correlation-id'] || uuidv4().replace(/-/g, '');
    req.correlationId = cid;
    reply.header('x-correlation-id', cid);

    const tenantId = req.headers['x-tenant-id'] || '';
    req.tenantId = tenantId;

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute('correlation.id', cid);
      if (tenantId) activeSpan.setAttribute('tenant.id', tenantId);
      reply.header('x-trace-id', activeSpan.spanContext().traceId);
    }

    const chaos = await redis.getChaosConfig(tenantId || 'public');
    if (chaos.enabled) {
      if (chaos.latencyMs > 0) {
        await new Promise((r) => setTimeout(r, chaos.latencyMs));
      }
      if (chaos.failPercent > 0 && Math.floor(Math.random() * 100) < chaos.failPercent) {
        reply
          .code(503)
          .send({ title: 'Service Unavailable', status: 503, detail: 'chaos failure injected' });
        return;
      }
    }

    const path: string = (req.url || '').split('?')[0];
    const bypassPaths = ['/docs', '/metrics', '/healthz', '/readyz', '/openapi', '/v1/docs', '/v1/metrics', '/v1/healthz', '/v1/readyz', '/v1/openapi'];
    if (bypassPaths.some((p) => path === p || path.startsWith(p + '/'))) {
      return;
    }
    const method = (req.method || 'GET').toUpperCase();
    const group = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'write' : 'read';
    const sub = redis.tryDecodeSubFromAuthHeader(req.headers['authorization']);
    const allowed = await redis.consumeRateLimit(tenantId || 'public', sub || 'anonymous', group);
    if (!allowed.allowed) {
      reply
        .code(429)
        .header('X-RateLimit-Limit', String(allowed.limit))
        .header('X-RateLimit-Remaining', String(allowed.remaining))
        .header('Retry-After', String(allowed.retryAfterSeconds))
        .send({ title: 'Too Many Requests', status: 429, detail: 'rate limit exceeded' });
      return;
    }
  });

  await app.register(helmet as any, {
    contentSecurityPolicy: false,
  });

  const port = Number(process.env.HTTP_PORT || 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
