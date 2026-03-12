import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { AuditService } from '../../src/shared/audit/audit.service';
import { BusinessMetricsService } from '../../src/shared/metrics/business-metrics.service';
import { OrdersService } from '../../src/interfaces/orders/orders.service';

const mockTx = {
  order: {
    create: jest.fn(),
    update: jest.fn(),
  },
  outboxEvent: { create: jest.fn() },
};

const mockPrisma = {
  $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<any>) => cb(mockTx)),
  order: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  product: { findMany: jest.fn() },
  outboxEvent: { create: jest.fn() },
};

const mockRedis = {
  idemGet: jest.fn(),
  idemSet: jest.fn(),
};

const mockAudit = { log: jest.fn() };
const mockMetrics = {
  ordersCreated: { inc: jest.fn() },
  ordersConfirmed: { inc: jest.fn() },
  ordersCancelled: { inc: jest.fn() },
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.product.findMany.mockResolvedValue([]);
    service = new OrdersService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      mockAudit as unknown as AuditService,
      mockMetrics as unknown as BusinessMetricsService,
    );
  });

  describe('createOrder', () => {
    it('should throw BadRequestException when Idempotency-Key is missing', async () => {
      await expect(
        service.createOrder('t1', 'cid', '', 'CUST-1', [{ sku: 'SKU-1', qty: 1, price: 10 }]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return cached response on idempotency hit', async () => {
      const cached = { id: 'o1', status: 'CREATED' };
      mockRedis.idemGet.mockResolvedValue(cached);
      const result = await service.createOrder('t1', 'cid', 'key-1', 'CUST-1', [
        { sku: 'SKU-1', qty: 1, price: 10 },
      ]);
      expect(result).toEqual(cached);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when items is empty', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      await expect(
        service.createOrder('t1', 'cid', 'key-1', 'CUST-1', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create order with valid data and return response', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      const createdOrder = {
        id: 'order-1',
        tenantId: 't1',
        customerId: 'CUST-1',
        status: 'CREATED',
        items: [{ sku: 'SKU-1', qty: 2, price: 15 }],
      };
      mockTx.order.create.mockResolvedValue(createdOrder);
      mockTx.outboxEvent.create.mockResolvedValue({});

      const result = await service.createOrder('t1', 'cid', 'key-new', 'CUST-1', [
        { sku: 'SKU-1', qty: 2, price: 15 },
      ]);

      expect(result).toEqual({
        id: 'order-1',
        status: 'CREATED',
        customerId: 'CUST-1',
        items: [{ sku: 'SKU-1', qty: 2, price: 15 }],
      });
      expect(mockTx.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't1',
          customerId: 'CUST-1',
          status: 'CREATED',
        }),
        include: { items: true },
      });
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'order.created',
          aggregateType: 'Order',
          aggregateId: 'order-1',
        }),
      });
    });

    it('should increment ordersCreated metric after creation', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.order.create.mockResolvedValue({
        id: 'o2',
        status: 'CREATED',
        customerId: 'C1',
        items: [],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.createOrder('t1', 'cid', 'key-m', 'C1', [
        { sku: 'S1', qty: 1, price: 5 },
      ]);

      expect(mockMetrics.ordersCreated.inc).toHaveBeenCalledWith({ tenant_id: 't1' });
    });

    it('should log audit event after creation', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.order.create.mockResolvedValue({
        id: 'o3',
        status: 'CREATED',
        customerId: 'C1',
        items: [{ sku: 'S1', qty: 1, price: 5 }],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.createOrder('t1', 'cid', 'key-a', 'C1', [
        { sku: 'S1', qty: 1, price: 5 },
      ], 'actor@test');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          actorSub: 'actor@test',
          action: 'order.created',
          target: 'Order:o3',
        }),
      );
    });

    it('should cache response in redis after creation', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.order.create.mockResolvedValue({
        id: 'o4',
        status: 'CREATED',
        customerId: 'C1',
        items: [],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.createOrder('t1', 'cid', 'key-c', 'C1', [
        { sku: 'S1', qty: 1, price: 5 },
      ]);

      expect(mockRedis.idemSet).toHaveBeenCalledWith(
        'idem:t1:create-order:key-c',
        expect.objectContaining({ id: 'o4', status: 'CREATED' }),
        24 * 3600,
      );
    });

    it('should default actorSub to unknown when not provided', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.order.create.mockResolvedValue({
        id: 'o5',
        status: 'CREATED',
        customerId: 'C1',
        items: [],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.createOrder('t1', 'cid', 'key-d', 'C1', [
        { sku: 'S1', qty: 1, price: 5 },
      ]);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorSub: 'unknown' }),
      );
    });
  });

  describe('confirmOrder', () => {
    it('should throw BadRequestException when Idempotency-Key is missing', async () => {
      await expect(
        service.confirmOrder('t1', 'cid', '', 'order-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return cached response on idempotency hit', async () => {
      const cached = { id: 'o1', status: 'CONFIRMED' };
      mockRedis.idemGet.mockResolvedValue(cached);

      const result = await service.confirmOrder('t1', 'cid', 'key-1', 'o1');

      expect(result).toEqual(cached);
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when order not found', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.confirmOrder('t1', 'cid', 'key-1', 'order-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when order status is not RESERVED', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CREATED',
        items: [],
      });
      await expect(
        service.confirmOrder('t1', 'cid', 'key-1', 'o1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should confirm a RESERVED order successfully', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        customerId: 'CUST-1',
        status: 'RESERVED',
        items: [{ sku: 'SKU-1', qty: 2, price: 10 }],
      });
      mockTx.order.update.mockResolvedValue({
        id: 'o1',
        status: 'CONFIRMED',
        items: [{ sku: 'SKU-1', qty: 2, price: 10 }],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      const result = await service.confirmOrder('t1', 'cid', 'key-confirm', 'o1', 'actor@test');

      expect(result).toEqual({ id: 'o1', status: 'CONFIRMED' });
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CONFIRMED', totalAmount: 20 },
        include: { items: true },
      });
    });

    it('should increment ordersConfirmed metric after confirmation', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        customerId: 'C1',
        status: 'RESERVED',
        items: [{ sku: 'S1', qty: 1, price: 5 }],
      });
      mockTx.order.update.mockResolvedValue({ id: 'o1', status: 'CONFIRMED', items: [] });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.confirmOrder('t1', 'cid', 'key-cm', 'o1');

      expect(mockMetrics.ordersConfirmed.inc).toHaveBeenCalledWith({ tenant_id: 't1' });
    });

    it('should publish order.confirmed outbox event with totalAmount', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        customerId: 'C1',
        status: 'RESERVED',
        items: [
          { sku: 'S1', qty: 2, price: 10 },
          { sku: 'S2', qty: 1, price: 25 },
        ],
      });
      mockTx.order.update.mockResolvedValue({ id: 'o1', status: 'CONFIRMED', items: [] });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.confirmOrder('t1', 'cid', 'key-ev', 'o1');

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'order.confirmed',
          payload: expect.objectContaining({
            totalAmount: 45,
            currency: 'BRL',
          }),
        }),
      });
    });

    it('should throw ConflictException when order is CANCELLED', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CANCELLED',
        items: [],
      });
      await expect(
        service.confirmOrder('t1', 'cid', 'key-can', 'o1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelOrder', () => {
    it('should throw NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.cancelOrder('t1', 'cid', 'order-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should cancel an existing order successfully', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CREATED',
        items: [{ sku: 'S1', qty: 1, price: 10 }],
      });
      mockTx.order.update.mockResolvedValue({
        id: 'o1',
        status: 'CANCELLED',
        items: [{ sku: 'S1', qty: 1, price: 10 }],
      });
      mockTx.outboxEvent.create.mockResolvedValue({});

      const result = await service.cancelOrder('t1', 'cid', 'o1', 'actor@test');

      expect(result).toEqual({ id: 'o1', status: 'CANCELLED' });
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });
    });

    it('should increment ordersCancelled metric', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'RESERVED',
        items: [],
      });
      mockTx.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED', items: [] });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.cancelOrder('t1', 'cid', 'o1');

      expect(mockMetrics.ordersCancelled.inc).toHaveBeenCalledWith({ tenant_id: 't1' });
    });

    it('should publish order.cancelled outbox event', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CREATED',
        items: [],
      });
      mockTx.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED', items: [] });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.cancelOrder('t1', 'cid', 'o1');

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'order.cancelled',
          aggregateType: 'Order',
          aggregateId: 'o1',
        }),
      });
    });

    it('should log audit event on cancellation', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CREATED',
        items: [],
      });
      mockTx.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED', items: [] });
      mockTx.outboxEvent.create.mockResolvedValue({});

      await service.cancelOrder('t1', 'cid', 'o1', 'actor@test');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          actorSub: 'actor@test',
          action: 'order.cancelled',
          target: 'Order:o1',
        }),
      );
    });
  });

  describe('getOrder', () => {
    it('should return order when found', async () => {
      const order = { id: 'o1', tenantId: 't1', status: 'CREATED', items: [] };
      mockPrisma.order.findFirst.mockResolvedValue(order);

      const result = await service.getOrder('t1', 'o1');

      expect(result).toEqual(order);
      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'o1', tenantId: 't1' },
        include: { items: true },
      });
    });

    it('should throw NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrder('t1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listOrders', () => {
    it('should return paginated orders with hasMore=false', async () => {
      const orders = [
        { id: 'o1', tenantId: 't1', status: 'CREATED', createdAt: new Date(), items: [] },
        { id: 'o2', tenantId: 't1', status: 'CREATED', createdAt: new Date(), items: [] },
      ];
      mockPrisma.order.findMany.mockResolvedValue(orders);

      const result = await service.listOrders('t1');

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return hasMore=true when more results exist', async () => {
      const orders = Array.from({ length: 21 }, (_, i) => ({
        id: `o${i}`,
        tenantId: 't1',
        status: 'CREATED',
        createdAt: new Date(),
        items: [],
      }));
      mockPrisma.order.findMany.mockResolvedValue(orders);

      const result = await service.listOrders('t1', undefined, undefined, undefined, undefined, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should filter by status when provided', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      await service.listOrders('t1', 'CONFIRMED');

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', status: 'CONFIRMED' },
        }),
      );
    });

    it('should not include status filter when not provided', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      await service.listOrders('t1');

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1' },
        }),
      );
    });

    it('should apply cursor-based pagination when cursor is provided', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ id: 'o5', createdAt: '2025-01-01T00:00:00.000Z' }),
      ).toString('base64url');
      mockPrisma.order.findMany.mockResolvedValue([]);

      await service.listOrders('t1', undefined, cursor, undefined, undefined, 10);

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'o5' },
          skip: 1,
        }),
      );
    });
  });
});
