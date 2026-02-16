import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { collectDefaultMetrics } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';

import { AppModule } from './app.module';
import { RedisService } from './infrastructure/redis/redis.service';

async function bootstrap() {
  collectDefaultMetrics();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['log', 'error', 'warn'],
  });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('node-b2b-orders')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const redis = app.get(RedisService);
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', async (req: any, reply: any) => {
    const cid = req.headers['x-correlation-id'] || uuidv4().replace(/-/g, '');
    req.correlationId = cid;
    reply.header('x-correlation-id', cid);

    const tenantId = req.headers['x-tenant-id'] || '';
    req.tenantId = tenantId;

    // Chaos injection (optional)
    const chaos = await redis.getChaosConfig(tenantId || 'public');
    if (chaos.enabled) {
      if (chaos.latencyMs > 0) {
        await new Promise((r) => setTimeout(r, chaos.latencyMs));
      }
      if (chaos.failPercent > 0 && Math.floor(Math.random() * 100) < chaos.failPercent) {
        reply.code(503).send({ title: 'Service Unavailable', status: 503, detail: 'chaos failure injected' });
        return;
      }
    }

    // Rate limit (skip docs/metrics/health)
    const path: string = req.url || '';
    if (path.startsWith('/docs') || path.startsWith('/metrics') || path.startsWith('/healthz') || path.startsWith('/readyz') || path.startsWith('/openapi')) {
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
    }
  });

  const port = Number(process.env.HTTP_PORT || 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
