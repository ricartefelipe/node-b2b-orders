import { PrismaClient } from '@prisma/client';

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
}));

import { handleOrderMessage, handlePaymentMessage, isAlreadyProcessed } from '../../src/worker/main';

const mockTx = {
  inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
  order: { update: jest.fn() },
  outboxEvent: { create: jest.fn() },
  product: { updateMany: jest.fn() },
};

const mockPrisma = {
  order: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn((fn: (tx: any) => Promise<void>) => fn(mockTx)),
};

describe('Worker handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: any) => Promise<void>) => fn(mockTx),
    );
  });

  describe('handleOrderMessage — order.created', () => {
    it('should skip when order is not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.created',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should cancel order when insufficient stock', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        items: [{ sku: 'SKU-1', qty: 5 }],
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        availableQty: 2,
      });
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.created',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CANCELLED' },
      });
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'order.cancelled' }),
        }),
      );
    });

    it('should reserve stock when available', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        items: [{ sku: 'SKU-1', qty: 2 }],
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({
        availableQty: 10,
      });
      mockTx.inventoryItem.update.mockResolvedValue({ availableQty: 8 });
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.created',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: { decrement: 2 }, reservedQty: { increment: 2 } },
        }),
      );
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'RESERVED' },
      });
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'stock.reserved' }),
        }),
      );
    });

    it('should mark product out of stock when reservation exhausts availableQty', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        items: [{ sku: 'SKU-LOW', qty: 3 }],
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({ availableQty: 3 });
      mockTx.inventoryItem.update.mockResolvedValue({ availableQty: 0 });
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.created',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', sku: 'SKU-LOW', active: true },
        data: { inStock: false },
      });
    });

    it('should ignore unknown order routing keys', async () => {
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.unknown',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderMessage — order.cancelled', () => {
    it('should skip when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.cancelled',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should release reserved stock on cancellation', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'RESERVED',
        items: [{ sku: 'SKU-1', qty: 3 }],
      });
      mockTx.inventoryItem.update.mockResolvedValue({ availableQty: 3 });
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.cancelled',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockTx.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableQty: { increment: 3 }, reservedQty: { decrement: 3 } },
        }),
      );
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('handleOrderMessage — order.confirmed', () => {
    it('should confirm order and create payment charge event', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'RESERVED',
        customerId: 'cust-1',
        items: [{ sku: 'SKU-1', qty: 2, price: 10 }],
      });
      await handleOrderMessage(
        mockPrisma as unknown as PrismaClient,
        'order.confirmed',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CONFIRMED' },
      });
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'payment.charge_requested' }),
        }),
      );
    });
  });

  describe('handlePaymentMessage', () => {
    it('should skip when orderId or tenantId is missing', async () => {
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        {},
      );
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('should skip when order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('should skip when order status is not CONFIRMED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'RESERVED',
      });
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('should mark order as PAID when status is CONFIRMED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
      });
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'PAID' },
      });
    });

    it('should accept snake_case order_id and tenant_id from ledger payloads', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
      });
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { order_id: 'o1', tenant_id: 't1' },
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'PAID' },
      });
    });

    it('should ignore non-payment.settled routing keys', async () => {
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.failed',
        { orderId: 'o1', tenantId: 't1' },
      );
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });
  });
});

describe('isAlreadyProcessed', () => {
  it('should return false when key is new (NX succeeded)', async () => {
    const mockRedis = { set: jest.fn().mockResolvedValue('OK') } as any;
    const result = await isAlreadyProcessed(mockRedis, 'order.created', 'evt-1');
    expect(result).toBe(false);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'processed:order.created:evt-1',
      '1',
      'EX',
      86400,
      'NX',
    );
  });

  it('should return true when key already exists (NX returned null)', async () => {
    const mockRedis = { set: jest.fn().mockResolvedValue(null) } as any;
    const result = await isAlreadyProcessed(mockRedis, 'order.created', 'evt-1');
    expect(result).toBe(true);
  });
});
