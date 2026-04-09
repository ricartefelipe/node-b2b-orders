import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import * as promClient from 'prom-client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@ApiTags('metrics')
@Controller()
export class MetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get('metrics')
  async metrics(@Res() res: FastifyReply) {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException({ status: 'fail', component: 'db', error: msg });
    }
    try {
      await this.redis.raw.ping();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException({ status: 'fail', component: 'redis', error: msg });
    }
    return { status: 'ok' };
  }
}
