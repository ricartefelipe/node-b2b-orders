import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';

import { ImportService } from './import.service';
import { ImportBodyDto } from './dto';

@ApiTags('import')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('import')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('products')
  @Permission('admin:write')
  async importProducts(@Req() req: AuthRequest, @Body() body: ImportBodyDto) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const actorSub = req.user?.sub || 'unknown';
    const correlationId = req.correlationId || '';
    return this.importService.importProducts(tenantId, actorSub, correlationId, body.format, body.data);
  }

  @Post('inventory')
  @Permission('admin:write')
  async importInventory(@Req() req: AuthRequest, @Body() body: ImportBodyDto) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const actorSub = req.user?.sub || 'unknown';
    const correlationId = req.correlationId || '';
    return this.importService.importInventory(tenantId, actorSub, correlationId, body.format, body.data);
  }

  @Post('orders')
  @Permission('admin:write')
  async importOrders(@Req() req: AuthRequest, @Body() body: ImportBodyDto) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const actorSub = req.user?.sub || 'unknown';
    const correlationId = req.correlationId || '';
    return this.importService.importOrders(tenantId, actorSub, correlationId, body.format, body.data);
  }
}
