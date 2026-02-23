import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';

import { CreateOrderRequestDto } from './dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Permission('orders:write')
  async create(
    @Req() req: any,
    @Headers('idempotency-key') idem: string,
    @Body() body: CreateOrderRequestDto
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const correlationId = req.correlationId || '';
    return this.orders.createOrder(tenantId, correlationId, idem, body.customerId, body.items);
  }

  @Post(':id/confirm')
  @Permission('orders:write')
  async confirm(
    @Req() req: any,
    @Headers('idempotency-key') idem: string,
    @Param('id') id: string
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.confirmOrder(tenantId, correlationId, idem, id, actorSub);
  }

  @Post(':id/cancel')
  @Permission('orders:write')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.headers['x-tenant-id'];
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.cancelOrder(tenantId, correlationId, id, actorSub);
  }

  @Get(':id')
  @Permission('orders:read')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.orders.getOrder(tenantId, id);
  }

  @Get()
  @Permission('orders:read')
  async list(@Req() req: any, @Query('status') status?: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.orders.listOrders(tenantId, status);
  }
}
