import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';
import { CursorPageQuery } from '../../shared/pagination/cursor';

import { SortQueryDto } from '../../shared/sorting/sort-query.dto';
import { CreateAdjustmentDto, ListAdjustmentsQueryDto } from './dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Permission('inventory:read')
  async list(
    @Req() req: AuthRequest,
    @Query() page: CursorPageQuery,
    @Query() sort: SortQueryDto,
    @Query('sku') sku?: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.inventory.list(tenantId, sku, page.cursor, sort.sortBy, sort.sortOrder, page.limit);
  }

  @Post('adjustments')
  @Permission('inventory:write')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async createAdjustment(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Body() body: CreateAdjustmentDto
  ) {
    if (!idem) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.inventory.createAdjustment(
      tenantId,
      correlationId,
      actorSub,
      idem,
      body.sku,
      body.type,
      body.qty,
      body.reason
    );
  }

  @Get('adjustments')
  @Permission('inventory:read')
  async listAdjustments(@Req() req: AuthRequest, @Query() query: ListAdjustmentsQueryDto) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.inventory.listAdjustments(tenantId, query.sku, query.cursor, query.limit);
  }
}
