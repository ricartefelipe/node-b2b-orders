import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../../shared/audit/audit.service';
import { BusinessMetricsService } from '../../shared/metrics/business-metrics.service';
import { EventsService } from '../events/events.service';
import {
  PaginatedResponse,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../shared/pagination/cursor';
import { resolveOrderSort } from '../../shared/sorting/sort-query.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly metrics: BusinessMetricsService,
    private readonly events: EventsService,
  ) {}

  async createOrder(
    tenantId: string,
    correlationId: string,
    idempotencyKey: string,
    customerId: string,
    items: { sku: string; qty: number; price: number }[],
    actorSub?: string,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Missing Idempotency-Key');
    const idemKey = `idem:${tenantId}:create-order:${idempotencyKey}`;
    const hit = await this.redis.idemGet(idemKey);
    if (hit) return hit;

    if (!items.length) throw new BadRequestException('items required');

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          tenantId,
          customerId,
          status: 'CREATED',
          items: { create: items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })) },
        },
        include: { items: true },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'order.created',
          aggregateType: 'Order',
          aggregateId: o.id,
          payload: { orderId: o.id, tenantId, correlationId },
        },
      });

      return o;
    });

    this.metrics.ordersCreated.inc({ tenant_id: tenantId });

    await this.audit.log({
      tenantId,
      actorSub: actorSub || 'unknown',
      action: 'order.created',
      target: `Order:${order.id}`,
      detail: { orderId: order.id, customerId, itemCount: items.length },
      correlationId,
    });

    const response = {
      id: order.id,
      status: order.status,
      customerId: order.customerId,
      items: order.items,
    };
    await this.redis.idemSet(idemKey, response, 24 * 3600);

    this.events.broadcast(tenantId, 'order.updated', {
      orderId: order.id,
      status: order.status,
      action: 'created',
      customerId: order.customerId,
    });

    return response;
  }

  async confirmOrder(
    tenantId: string,
    correlationId: string,
    idempotencyKey: string,
    orderId: string,
    actorSub?: string
  ) {
    if (!idempotencyKey) throw new BadRequestException('Missing Idempotency-Key');
    const idemKey = `idem:${tenantId}:confirm-order:${orderId}:${idempotencyKey}`;
    const hit = await this.redis.idemGet(idemKey);
    if (hit) return hit;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== 'RESERVED')
      throw new ConflictException(`cannot confirm status ${order.status}`);

    const totalAmount = order.items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED', totalAmount },
        include: { items: true },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'order.confirmed',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: {
            orderId,
            tenantId,
            correlationId,
            customerId: order.customerId,
            items: order.items.map((i) => ({ sku: i.sku, qty: i.qty, price: Number(i.price) })),
            totalAmount,
            currency: 'BRL',
          },
        },
      });

      return o;
    });

    this.metrics.ordersConfirmed.inc({ tenant_id: tenantId });

    await this.audit.log({
      tenantId,
      actorSub: actorSub || 'unknown',
      action: 'order.confirmed',
      target: `Order:${orderId}`,
      detail: { orderId, totalAmount },
      correlationId,
    });

    const response = { id: updated.id, status: updated.status };
    await this.redis.idemSet(idemKey, response, 24 * 3600);

    this.events.broadcast(tenantId, 'order.updated', {
      orderId: updated.id,
      status: updated.status,
      action: 'confirmed',
    });

    return response;
  }

  async cancelOrder(tenantId: string, correlationId: string, orderId: string, actorSub?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'order.cancelled',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, tenantId, correlationId },
        },
      });
      return o;
    });

    this.metrics.ordersCancelled.inc({ tenant_id: tenantId });

    await this.audit.log({
      tenantId,
      actorSub: actorSub || 'unknown',
      action: 'order.cancelled',
      target: `Order:${orderId}`,
      detail: { orderId },
      correlationId,
    });

    this.events.broadcast(tenantId, 'order.updated', {
      orderId: updated.id,
      status: updated.status,
      action: 'cancelled',
    });

    return { id: updated.id, status: updated.status };
  }

  async shipOrder(
    tenantId: string,
    correlationId: string,
    idempotencyKey: string,
    orderId: string,
    trackingCode: string,
    trackingUrl: string | undefined,
    actorSub?: string,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Missing Idempotency-Key');
    const idemKey = `idem:${tenantId}:ship-order:${orderId}:${idempotencyKey}`;
    const hit = await this.redis.idemGet(idemKey);
    if (hit) return hit;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== 'PAID')
      throw new ConflictException(`cannot ship order with status ${order.status}`);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'SHIPPED',
          trackingCode,
          trackingUrl: trackingUrl || null,
          shippedAt: now,
        },
        include: { items: true },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'order.shipped',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, tenantId, correlationId, trackingCode, trackingUrl: trackingUrl || null },
        },
      });
      return o;
    });

    await this.audit.log({
      tenantId,
      actorSub: actorSub || 'unknown',
      action: 'order.shipped',
      target: `Order:${orderId}`,
      detail: { orderId, trackingCode },
      correlationId,
    });

    const response = { id: updated.id, status: updated.status };
    await this.redis.idemSet(idemKey, response, 24 * 3600);

    this.events.broadcast(tenantId, 'order.updated', {
      orderId: updated.id,
      status: updated.status,
      action: 'shipped',
      trackingCode,
    });

    return response;
  }

  async deliverOrder(
    tenantId: string,
    correlationId: string,
    idempotencyKey: string,
    orderId: string,
    actorSub?: string,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Missing Idempotency-Key');
    const idemKey = `idem:${tenantId}:deliver-order:${orderId}:${idempotencyKey}`;
    const hit = await this.redis.idemGet(idemKey);
    if (hit) return hit;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== 'SHIPPED')
      throw new ConflictException(`cannot deliver order with status ${order.status}`);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', deliveredAt: now },
        include: { items: true },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'order.delivered',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, tenantId, correlationId },
        },
      });
      return o;
    });

    await this.audit.log({
      tenantId,
      actorSub: actorSub || 'unknown',
      action: 'order.delivered',
      target: `Order:${orderId}`,
      detail: { orderId },
      correlationId,
    });

    const response = { id: updated.id, status: updated.status };
    await this.redis.idemSet(idemKey, response, 24 * 3600);

    this.events.broadcast(tenantId, 'order.updated', {
      orderId: updated.id,
      status: updated.status,
      action: 'delivered',
    });

    return response;
  }

  async getOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async listOrders(
    tenantId: string,
    status?: string,
    cursor?: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    rawLimit?: number,
    filters?: {
      q?: string;
      minAmount?: number;
      maxAmount?: number;
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const limit = resolveLimit(rawLimit);
    const where = await this.buildListOrdersWhere(tenantId, status, filters);

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: resolveOrderSort(sortBy, sortOrder),
      take: limit + 1,
      include: { items: true },
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        findArgs.cursor = { id: decoded.id };
        findArgs.skip = 1;
      }
    }

    const rows = await this.prisma.order.findMany(findArgs as any);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.id, last.createdAt) : null;

    return { data, nextCursor, hasMore };
  }

  private async buildListOrdersWhere(
    tenantId: string,
    status?: string,
    filters?: {
      q?: string;
      minAmount?: number;
      maxAmount?: number;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const base: Record<string, unknown> = { tenantId };
    if (status) base.status = status;

    const and: Record<string, unknown>[] = [];

    if (filters?.minAmount != null) {
      and.push({ totalAmount: { gte: filters.minAmount } });
    }
    if (filters?.maxAmount != null) {
      and.push({ totalAmount: { lte: filters.maxAmount } });
    }
    if (filters?.dateFrom) {
      const d = new Date(filters.dateFrom);
      if (!isNaN(d.getTime())) and.push({ createdAt: { gte: d } });
    }
    if (filters?.dateTo) {
      const d = new Date(filters.dateTo);
      if (!isNaN(d.getTime())) and.push({ createdAt: { lte: d } });
    }

    if (and.length > 0) base.AND = and;

    if (filters?.q && filters.q.trim()) {
      const q = filters.q.trim();
      const searchTerms: Record<string, unknown>[] = [
        { customerId: { contains: q, mode: 'insensitive' } },
        { status: { contains: q, mode: 'insensitive' } },
        { items: { some: { sku: { contains: q, mode: 'insensitive' } } } },
      ];

      const products = await this.prisma.product.findMany({
        where: {
          tenantId,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { sku: true },
      });
      if (products.length > 0) {
        const skuList = products.map((p) => p.sku);
        searchTerms.push({ items: { some: { sku: { in: skuList } } } });
      }

      base.OR = searchTerms;
    }

    return base;
  }
}
