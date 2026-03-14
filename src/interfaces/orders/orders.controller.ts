import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';
import { CursorPageQuery } from '../../shared/pagination/cursor';

import { SortQueryDto } from '../../shared/sorting/sort-query.dto';
import { CreateOrderRequestDto, ShipOrderDto } from './dto';
import { ListOrdersQueryDto } from './list-orders-query.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Permission('orders:write')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Chave de idempotência' })
  async create(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Body() body: CreateOrderRequestDto
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.createOrder(tenantId, correlationId, idem, body.customerId, body.items, actorSub);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Permission('orders:write')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Chave de idempotência' })
  async confirm(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.confirmOrder(tenantId, correlationId, idem, id, actorSub);
  }

  @Post(':id/ship')
  @HttpCode(200)
  @Permission('orders:write')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Chave de idempotência' })
  async ship(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ShipOrderDto,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.shipOrder(tenantId, correlationId, idem, id, body.trackingCode, body.trackingUrl, actorSub);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @Permission('orders:write')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Chave de idempotência' })
  async deliver(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.deliverOrder(tenantId, correlationId, idem, id, actorSub);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permission('orders:write')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Chave de idempotência' })
  async cancel(
    @Req() req: AuthRequest,
    @Headers('idempotency-key') idem: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.correlationId || '';
    const actorSub = req.user?.sub || 'unknown';
    return this.orders.cancelOrder(tenantId, correlationId, idem, id, actorSub);
  }

  @Get(':id')
  @Permission('orders:read')
  async getOne(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.orders.getOrder(tenantId, id);
  }

  @Get()
  @Permission('orders:read')
  async list(
    @Req() req: AuthRequest,
    @Query() page: CursorPageQuery,
    @Query() sort: SortQueryDto,
    @Query() filters: ListOrdersQueryDto,
    @Query('status') status?: string,
  ) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return this.orders.listOrders(
      tenantId,
      status,
      page.cursor,
      sort.sortBy,
      sort.sortOrder,
      page.limit,
      filters.q || filters.minAmount != null || filters.maxAmount != null || filters.dateFrom || filters.dateTo
        ? { q: filters.q, minAmount: filters.minAmount, maxAmount: filters.maxAmount, dateFrom: filters.dateFrom, dateTo: filters.dateTo }
        : undefined,
    );
  }
}
