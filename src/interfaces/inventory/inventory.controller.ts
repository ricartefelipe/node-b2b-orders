import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';

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
  async list(@Req() req: any, @Query('sku') sku?: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.inventory.list(tenantId, sku);
  }
}
