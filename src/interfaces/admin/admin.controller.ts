import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ChaosConfigDto } from './dto';

@ApiTags('admin')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class AdminController {
  constructor(private readonly redis: RedisService) {}

  @Get('chaos')
  @Permission('admin:write')
  async getChaos(@Req() req: AuthRequest) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.redis.getChaosConfig(tenantId);
  }

  @Put('chaos')
  @Permission('admin:write')
  async setChaos(@Req() req: AuthRequest, @Body() body: ChaosConfigDto) {
    const tenantId = req.headers['x-tenant-id'] as string;
    await this.redis.setChaosConfig(tenantId, body);
    return body;
  }
}
