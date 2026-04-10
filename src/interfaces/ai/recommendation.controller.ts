import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';

import { RecommendationService } from './recommendation.service';

@ApiTags('ai')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('ai/recommendations')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class RecommendationController {
  constructor(private readonly recommendations: RecommendationService) {}

  @Get('customer/:customerId')
  @Permission('analytics:read')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getForCustomer(
    @Req() req: AuthRequest,
    @Param('customerId') customerId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.recommendations.getRecommendationsForCustomer(tenantId, customerId, limit);
  }

  @Get('trending')
  @Permission('analytics:read')
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTrending(
    @Req() req: AuthRequest,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.recommendations.getTrendingProducts(tenantId, days, limit);
  }

  @Get('together/:sku')
  @Permission('analytics:read')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFrequentlyBoughtTogether(
    @Req() req: AuthRequest,
    @Param('sku') sku: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.recommendations.getFrequentlyBoughtTogether(tenantId, sku, limit);
  }

  @Get('feed/:customerId')
  @Permission('analytics:read')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPersonalizedFeed(
    @Req() req: AuthRequest,
    @Param('customerId') customerId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.recommendations.getPersonalizedFeed(tenantId, customerId, limit);
  }
}
