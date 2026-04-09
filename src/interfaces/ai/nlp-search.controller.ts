import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';

import { NlpSearchService } from './nlp-search.service';

@ApiTags('ai')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('ai/search')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class NlpSearchController {
  constructor(private readonly nlpSearch: NlpSearchService) {}

  @Get('orders')
  @Permission('analytics:read')
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Natural language query' })
  async searchOrders(
    @Req() req: AuthRequest,
    @Query('q') q: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.nlpSearch.searchOrders(tenantId, q ?? '');
  }

  @Get('products')
  @Permission('analytics:read')
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Natural language query' })
  async searchProducts(
    @Req() req: AuthRequest,
    @Query('q') q: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.nlpSearch.searchProducts(tenantId, q ?? '');
  }
}
