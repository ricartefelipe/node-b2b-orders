import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async createOrder(tenantId: string, correlationId: string, idempotencyKey: string, customerId: string, items: { sku: string; qty: number; price: number }[]) {
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

    const response = { id: order.id, status: order.status, customerId: order.customerId, items: order.items };
    await this.redis.idemSet(idemKey, response, 24 * 3600);
    return response;
  }

  async confirmOrder(tenantId: string, correlationId: string, idempotencyKey: string, orderId: string) {
    if (!idempotencyKey) throw new BadRequestException('Missing Idempotency-Key');
    const idemKey = `idem:${tenantId}:confirm-order:${orderId}:${idempotencyKey}`;
    const hit = await this.redis.idemGet(idemKey);
    if (hit) return hit;

    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== 'RESERVED') throw new ConflictException(`cannot confirm status ${order.status}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' }, include: { items: true } });
      await tx.outboxEvent.create({
        data: { tenantId, eventType: 'order.confirmed', aggregateType: 'Order', aggregateId: orderId, payload: { orderId, tenantId, correlationId } },
      });
      return o;
    });

    const response = { id: updated.id, status: updated.status };
    await this.redis.idemSet(idemKey, response, 24 * 3600);
    return response;
  }

  async cancelOrder(tenantId: string, correlationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) throw new NotFoundException('order not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' }, include: { items: true } });
      await tx.outboxEvent.create({
        data: { tenantId, eventType: 'order.cancelled', aggregateType: 'Order', aggregateId: orderId, payload: { orderId, tenantId, correlationId } },
      });
      return o;
    });

    return { id: updated.id, status: updated.status };
  }

  async getOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async listOrders(tenantId: string, status?: string) {
    return this.prisma.order.findMany({ where: { tenantId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
