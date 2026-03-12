import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { AuditService } from '../../src/shared/audit/audit.service';
import { BusinessMetricsService } from '../../src/shared/metrics/business-metrics.service';
import { InventoryService } from '../../src/interfaces/inventory/inventory.service';
import { AdjustmentType } from '../../src/interfaces/inventory/dto';

const mockTx = {
  inventoryItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  inventoryAdjustment: { create: jest.fn() },
};

const mockPrisma = {
  $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<any>) => cb(mockTx)),
  inventoryItem: { findMany: jest.fn() },
  inventoryAdjustment: { findMany: jest.fn() },
};

const mockRedis = {
  idemGet: jest.fn(),
  idemSet: jest.fn(),
};

const mockAudit = { log: jest.fn() };
const mockMetrics = {
  inventoryAdjusted: { inc: jest.fn() },
};

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      mockAudit as unknown as AuditService,
      mockMetrics as unknown as BusinessMetricsService,
    );
  });

  describe('list', () => {
    it('should return paginated inventory items', async () => {
      const items = [
        { id: 'i1', tenantId: 't1', sku: 'SKU-1', availableQty: 50 },
        { id: 'i2', tenantId: 't1', sku: 'SKU-2', availableQty: 30 },
      ];
      mockPrisma.inventoryItem.findMany.mockResolvedValue(items);

      const result = await service.list('t1', undefined, undefined, 20);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by SKU when provided', async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list('t1', 'SKU-1', undefined, 20);

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', sku: 'SKU-1' },
        }),
      );
    });
  });

  describe('createAdjustment', () => {
    it('should return cached response on idempotency hit', async () => {
      const cached = { id: 'adj-1', sku: 'SKU-1', type: 'IN', qty: 10 };
      mockRedis.idemGet.mockResolvedValue(cached);

      const result = await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-1', 'SKU-1', AdjustmentType.IN, 10, 'restock',
      );

      expect(result).toEqual(cached);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should create inventory item on first IN adjustment for new SKU', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue(null);
      mockTx.inventoryItem.create.mockResolvedValue({
        tenantId: 't1', sku: 'NEW-SKU', availableQty: 0, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      const adjustment = { id: 'adj-new', sku: 'NEW-SKU', type: 'IN', qty: 50 };
      mockTx.inventoryAdjustment.create.mockResolvedValue(adjustment);

      const result = await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-new', 'NEW-SKU', AdjustmentType.IN, 50, 'initial stock',
      );

      expect(result).toEqual(adjustment);
      expect(mockTx.inventoryItem.create).toHaveBeenCalled();
      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: 50 },
        }),
      );
    });

    it('should increment availableQty on IN adjustment', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-in' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-in', 'SKU-1', AdjustmentType.IN, 25, 'restock',
      );

      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: 125 },
        }),
      );
    });

    it('should decrement availableQty on OUT adjustment', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-out' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-out', 'SKU-1', AdjustmentType.OUT, 30, 'sold',
      );

      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: 70 },
        }),
      );
    });

    it('should throw ConflictException when OUT qty exceeds available', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 5, reservedQty: 0,
      });

      await expect(
        service.createAdjustment(
          't1', 'cid', 'actor@e2e', 'key-over', 'SKU-1', AdjustmentType.OUT, 10, 'oversell',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException on OUT for nonexistent SKU', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createAdjustment(
          't1', 'cid', 'actor@e2e', 'key-404', 'NO-SKU', AdjustmentType.OUT, 1, 'missing',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set absolute qty on ADJUSTMENT type', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-abs' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-abs', 'SKU-1', AdjustmentType.ADJUSTMENT, 42, 'count fix',
      );

      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: 42 },
        }),
      );
    });

    it('should log audit event after successful adjustment', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-audit' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-audit', 'SKU-1', AdjustmentType.IN, 10, 'test audit',
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          actorSub: 'actor@e2e',
          action: 'inventory.adjustment',
        }),
      );
    });
  });

  describe('createAdjustment — edge cases', () => {
    it('should work without idempotency key (no cache check)', async () => {
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      const adjustment = { id: 'adj-nokey', sku: 'SKU-1', type: 'IN', qty: 5 };
      mockTx.inventoryAdjustment.create.mockResolvedValue(adjustment);

      const result = await service.createAdjustment(
        't1', 'cid', 'actor@e2e', undefined, 'SKU-1', AdjustmentType.IN, 5, 'no key',
      );

      expect(result).toEqual(adjustment);
      expect(mockRedis.idemGet).not.toHaveBeenCalled();
      expect(mockRedis.idemSet).not.toHaveBeenCalled();
    });

    it('should cache result when idempotency key is provided', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 50, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-cache' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'idem-key-1', 'SKU-1', AdjustmentType.IN, 10, 'restock',
      );

      expect(mockRedis.idemSet).toHaveBeenCalledWith(
        'idem:t1:inv-adj:idem-key-1',
        expect.objectContaining({ id: 'adj-cache' }),
        24 * 3600,
      );
    });

    it('should increment inventoryAdjusted metric with correct labels', async () => {
      mockRedis.idemGet.mockResolvedValue(null);
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        tenantId: 't1', sku: 'SKU-1', availableQty: 100, reservedQty: 0,
      });
      mockTx.inventoryItem.update.mockResolvedValue({});
      mockTx.inventoryAdjustment.create.mockResolvedValue({ id: 'adj-met' });

      await service.createAdjustment(
        't1', 'cid', 'actor@e2e', 'key-met', 'SKU-1', AdjustmentType.OUT, 5, 'sold',
      );

      expect(mockMetrics.inventoryAdjusted.inc).toHaveBeenCalledWith({
        tenant_id: 't1',
        type: 'OUT',
      });
    });
  });

  describe('list — edge cases', () => {
    it('should return hasMore=true when more results exist', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `i${i}`,
        tenantId: 't1',
        sku: `SKU-${i}`,
        availableQty: i * 10,
      }));
      mockPrisma.inventoryItem.findMany.mockResolvedValue(items);

      const result = await service.list('t1', undefined, undefined, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should apply cursor-based pagination when cursor is provided', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ id: 'i5', createdAt: '2025-01-01T00:00:00.000Z' }),
      ).toString('base64url');
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list('t1', undefined, cursor, 10);

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'i5' },
          skip: 1,
        }),
      );
    });

    it('should default limit when rawLimit is undefined', async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list('t1');

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });
  });

  describe('listAdjustments', () => {
    it('should return paginated adjustments', async () => {
      const adjustments = [
        { id: 'a1', sku: 'SKU-1', type: 'IN', qty: 10, createdAt: new Date() },
      ];
      mockPrisma.inventoryAdjustment.findMany.mockResolvedValue(adjustments);

      const result = await service.listAdjustments('t1', undefined, undefined, 20);

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter adjustments by SKU', async () => {
      mockPrisma.inventoryAdjustment.findMany.mockResolvedValue([]);

      await service.listAdjustments('t1', 'SKU-1', undefined, 20);

      expect(mockPrisma.inventoryAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', sku: 'SKU-1' },
        }),
      );
    });

    it('should return hasMore=true when more adjustments exist', async () => {
      const adjustments = Array.from({ length: 21 }, (_, i) => ({
        id: `a${i}`,
        sku: 'SKU-1',
        type: 'IN',
        qty: 10,
        createdAt: new Date(),
      }));
      mockPrisma.inventoryAdjustment.findMany.mockResolvedValue(adjustments);

      const result = await service.listAdjustments('t1', undefined, undefined, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should apply cursor-based pagination for adjustments', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ id: 'a5', createdAt: '2025-06-01T00:00:00.000Z' }),
      ).toString('base64url');
      mockPrisma.inventoryAdjustment.findMany.mockResolvedValue([]);

      await service.listAdjustments('t1', undefined, cursor, 10);

      expect(mockPrisma.inventoryAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'a5' },
          skip: 1,
        }),
      );
    });
  });
});
