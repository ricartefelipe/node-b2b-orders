import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';

import { ExportService } from './export.service';
import { ExportFormat, ExportOrdersQueryDto, ExportProductsQueryDto } from './dto';

@ApiTags('export')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('export')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('orders')
  @Permission('analytics:read')
  async exportOrders(
    @Req() req: any,
    @Res() reply: FastifyReply,
    @Query() query: ExportOrdersQueryDto,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const filters = {
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      status: query.status,
    };

    if (query.format === ExportFormat.JSON) {
      const data = await this.exportService.exportOrdersJson(tenantId, filters);
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', 'attachment; filename=orders.json')
        .send(data);
    }

    const csv = await this.exportService.exportOrders(tenantId, filters);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename=orders.csv')
      .send(csv);
  }

  @Get('products')
  @Permission('analytics:read')
  async exportProducts(
    @Req() req: any,
    @Res() reply: FastifyReply,
    @Query() query: ExportProductsQueryDto,
  ) {
    const tenantId = req.headers['x-tenant-id'];

    if (query.format === ExportFormat.JSON) {
      const data = await this.exportService.exportProductsJson(tenantId);
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', 'attachment; filename=products.json')
        .send(data);
    }

    const csv = await this.exportService.exportProducts(tenantId);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename=products.csv')
      .send(csv);
  }

  @Get('inventory')
  @Permission('analytics:read')
  async exportInventory(
    @Req() req: any,
    @Res() reply: FastifyReply,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const csv = await this.exportService.exportInventory(tenantId);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename=inventory.csv')
      .send(csv);
  }
}
