import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as promClient from 'prom-client';
import type { FastifyReply } from 'fastify';
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
      return { status: 'fail', component: 'db', error: String(e instanceof Error ? e.message : e) };
    }
    try {
      await this.redis.raw.ping();
    } catch (e: unknown) {
      return { status: 'fail', component: 'redis', error: String(e instanceof Error ? e.message : e) };
    }
    return { status: 'ok' };
  }
}
