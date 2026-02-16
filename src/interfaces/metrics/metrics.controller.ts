import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Registry } from 'prom-client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@ApiTags('metrics')
@Controller()
export class MetricsController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get('metrics')
  async metrics(@Res() res: any) {
    const registry = new Registry();
    // Default registry already has metrics; for simplicity we return the global one
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const promClient = require('prom-client');
    res.header('Content-Type', promClient.register.contentType);
    res.send(await promClient.register.metrics());
  }

  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e: any) {
      return { status: 'fail', component: 'db', error: String(e?.message || e) };
    }
    try {
      await this.redis.raw.ping();
    } catch (e: any) {
      return { status: 'fail', component: 'redis', error: String(e?.message || e) };
    }
    return { status: 'ok' };
  }
}
