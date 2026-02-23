import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { AuditService } from '../../src/shared/audit/audit.service';
import { BusinessMetricsService } from '../../src/shared/metrics/business-metrics.service';
import { OrdersService } from '../../src/interfaces/orders/orders.service';

const mockPrisma = {
  $transaction: jest.fn(),
  order: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
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
    service = new OrdersService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      mockAudit as unknown as AuditService,
      mockMetrics as unknown as BusinessMetricsService
    );
  });

  describe('createOrder', () => {
    it('should throw BadRequestException when Idempotency-Key is missing', async () => {
      await expect(
        service.createOrder('t1', 'cid', '', 'CUST-1', [{ sku: 'SKU-1', qty: 1, price: 10 }])
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
        service.createOrder('t1', 'cid', 'key-1', 'CUST-1', [])
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmOrder', () => {
    it('should throw BadRequestException when Idempotency-Key is missing', async () => {
      await expect(
        service.confirmOrder('t1', 'cid', '', 'order-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when order not found', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.confirmOrder('t1', 'cid', 'key-1', 'order-1')
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
        service.confirmOrder('t1', 'cid', 'key-1', 'o1')
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelOrder', () => {
    it('should throw NotFoundException when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.cancelOrder('t1', 'cid', 'order-1')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
