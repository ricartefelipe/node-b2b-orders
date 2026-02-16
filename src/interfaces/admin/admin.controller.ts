import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { RedisService, ChaosConfig } from '../../infrastructure/redis/redis.service';

@ApiTags('admin')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class AdminController {
  constructor(private readonly redis: RedisService) {}

  @Get('chaos')
  @Permission('admin:write')
  async getChaos(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.redis.getChaosConfig(tenantId);
  }

  @Put('chaos')
  @Permission('admin:write')
  async setChaos(@Req() req: any, @Body() body: ChaosConfig) {
    const tenantId = req.headers['x-tenant-id'];
    await this.redis.setChaosConfig(tenantId, body);
    return body;
  }
}
