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
import {
  PaginatedResponse,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../shared/pagination/cursor';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly metrics: BusinessMetricsService
  ) {}

  async createOrder(
    tenantId: string,
    correlationId: string,
    idempotencyKey: string,
    customerId: string,
    items: { sku: string; qty: number; price: number }[]
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

    const response = {
      id: order.id,
      status: order.status,
      customerId: order.customerId,
      items: order.items,
    };
    await this.redis.idemSet(idemKey, response, 24 * 3600);
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
        data: { status: 'CONFIRMED' },
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

    return { id: updated.id, status: updated.status };
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
    rawLimit?: number,
  ): Promise<PaginatedResponse<any>> {
    const limit = resolveLimit(rawLimit);
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: { createdAt: 'desc' as const },
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
}
