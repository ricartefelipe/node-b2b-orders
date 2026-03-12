import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';

import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('demand')
  @Permission('analytics:read')
  async getDemand(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.analytics.getDemandAnalytics(tenantId);
  }

  @Get('anomalies')
  @Permission('analytics:read')
  async getAnomalies(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.analytics.getAnomalies(tenantId);
  }

  @Get('inventory-forecast')
  @Permission('analytics:read')
  @ApiQuery({ name: 'lowStockThreshold', required: false, type: Number, description: 'Threshold for low stock (default: 10)' })
  async getInventoryForecast(
    @Req() req: any,
    @Query('lowStockThreshold') lowStockThreshold?: string,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const threshold = lowStockThreshold ? parseInt(lowStockThreshold, 10) : 10;
    return this.analytics.getInventoryForecast(tenantId, isNaN(threshold) ? 10 : threshold);
  }
}
