import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { CursorPageQuery } from '../../shared/pagination/cursor';

import { CreateAdjustmentDto, ListAdjustmentsQueryDto } from './dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Permission('inventory:read')
  async list(@Req() req: any, @Query() page: CursorPageQuery, @Query('sku') sku?: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.inventory.list(tenantId, sku, page.cursor, page.limit);
  }

  @Post('adjustments')
  @Permission('inventory:write')
  async createAdjustment(
    @Req() req: any,
    @Headers('idempotency-key') idem: string,
    @Body() body: CreateAdjustmentDto
  ) {
    const tenantId = req.headers['x-tenant-id'];
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
  async listAdjustments(@Req() req: any, @Query() query: ListAdjustmentsQueryDto) {
    const tenantId = req.headers['x-tenant-id'];
    return this.inventory.listAdjustments(tenantId, query.sku, query.cursor, query.limit);
  }
}
