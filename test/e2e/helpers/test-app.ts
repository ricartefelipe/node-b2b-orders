import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../../src/app.module';

export interface TestContext {
  app: NestFastifyApplication;
  url: string;
  token: string;
  tenantId: string;
}

const TEST_TENANT = 'tenant_demo';

const TEST_JWT_PAYLOAD = {
  sub: 'test@e2e.local',
  tid: TEST_TENANT,
  plan: 'pro',
  region: 'region-a',
  roles: ['admin'],
  perms: [
    'orders:read',
    'orders:write',
    'products:read',
    'products:write',
    'inventory:read',
    'inventory:write',
  ],
};

export async function createTestApp(): Promise<TestContext> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const jwt = module.get(JwtService);
  const token = await jwt.signAsync(TEST_JWT_PAYLOAD);

  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address() as { port: number };
  const port = addr.port;
  const url = `http://127.0.0.1:${port}`;

  return { app, url, token, tenantId: TEST_TENANT };
}

export function authHeaders(ctx: TestContext, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${ctx.token}`,
    'X-Tenant-Id': ctx.tenantId,
    ...extra,
  };
}
