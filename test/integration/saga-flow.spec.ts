import { PrismaClient } from '@prisma/client';

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
}));

import {
  handleOrderMessage,
  handlePaymentMessage,
} from '../../src/worker/main';
import { validateEventPayload } from '../../src/shared/events/schema-validator';

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

function prisma() {
  return mockPrisma as unknown as PrismaClient;
}

describe('Saga flow: order → payment → settlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: any) => Promise<void>) => fn(mockTx),
    );
  });

  describe('Phase 1 — order.created reserves inventory', () => {
    it('should reserve stock and create stock.reserved outbox event', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        customerId: 'cust-1',
        status: 'CREATED',
        items: [
          { sku: 'SKU-A', qty: 3, price: 25 },
          { sku: 'SKU-B', qty: 1, price: 50 },
        ],
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({ availableQty: 100 });
      mockTx.inventoryItem.update.mockResolvedValue({ availableQty: 97 });

      await handleOrderMessage(prisma(), 'order.created', {
        orderId: 'o1',
        tenantId: 't1',
        correlationId: 'corr-1',
      });

      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'RESERVED' },
      });
      expect(mockTx.inventoryItem.update).toHaveBeenCalledTimes(2);
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'stock.reserved' }),
        }),
      );
    });

    it('should cancel order when stock is insufficient', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o2',
        tenantId: 't1',
        items: [{ sku: 'SKU-A', qty: 99 }],
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({ availableQty: 5 });

      await handleOrderMessage(prisma(), 'order.created', {
        orderId: 'o2',
        tenantId: 't1',
      });

      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o2' },
        data: { status: 'CANCELLED' },
      });
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'order.cancelled' }),
        }),
      );
    });
  });

  describe('Phase 2 — order.confirmed triggers charge request', () => {
    it('should confirm RESERVED order and publish payment.charge_requested', async () => {
      const order = {
        id: 'o1',
        tenantId: 't1',
        customerId: 'cust-1',
        status: 'RESERVED',
        items: [
          { sku: 'SKU-A', qty: 2, price: 25 },
          { sku: 'SKU-B', qty: 1, price: 50 },
        ],
      };
      mockPrisma.order.findFirst.mockResolvedValue(order);

      await handleOrderMessage(prisma(), 'order.confirmed', {
        orderId: 'o1',
        tenantId: 't1',
        correlationId: 'corr-2',
      });

      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CONFIRMED' },
      });

      const outboxCall = mockTx.outboxEvent.create.mock.calls[0][0];
      expect(outboxCall.data.eventType).toBe('payment.charge_requested');
      expect(outboxCall.data.payload).toMatchObject({
        orderId: 'o1',
        tenantId: 't1',
        customerId: 'cust-1',
        totalAmount: 100,
        currency: 'BRL',
      });
      expect(Array.isArray(outboxCall.data.payload.items)).toBe(true);
      expect(outboxCall.data.payload.items).toHaveLength(2);
    });

    it('should publish charge_requested event conforming to JSON schema', async () => {
      const order = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: 't1',
        customerId: 'cust-1',
        status: 'RESERVED',
        items: [{ sku: 'SKU-A', qty: 1, price: 30 }],
      };
      mockPrisma.order.findFirst.mockResolvedValue(order);

      await handleOrderMessage(prisma(), 'order.confirmed', {
        orderId: order.id,
        tenantId: 't1',
        correlationId: 'corr-schema',
      });

      const outboxPayload = mockTx.outboxEvent.create.mock.calls[0][0].data.payload;
      const validation = validateEventPayload('payment.charge_requested', outboxPayload);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Phase 3 — payment.settled completes the saga', () => {
    it('should update CONFIRMED order to PAID on payment.settled', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
      });

      await handlePaymentMessage(prisma(), 'payment.settled', {
        orderId: 'o1',
        tenantId: 't1',
        correlationId: 'corr-3',
      });

      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'PAID' },
      });
    });

    it('should ignore payment.settled when order is not CONFIRMED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'RESERVED',
      });

      await handlePaymentMessage(prisma(), 'payment.settled', {
        orderId: 'o1',
        tenantId: 't1',
      });

      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('should handle snake_case field names from py-payments-ledger', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
      });

      await handlePaymentMessage(prisma(), 'payment.settled', {
        order_id: 'o1',
        tenant_id: 't1',
        correlation_id: 'corr-snake',
      });

      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'PAID' },
      });
    });
  });

  describe('Full saga round-trip', () => {
    it('should progress order through CREATED → RESERVED → CONFIRMED → PAID', async () => {
      const orderId = 'saga-order-1';
      const tenantId = 't1';
      const statusHistory: string[] = [];

      mockTx.order.update.mockImplementation(({ data }: any) => {
        statusHistory.push(data.status);
        return Promise.resolve();
      });
      mockTx.inventoryItem.findUnique.mockResolvedValue({ availableQty: 100 });
      mockTx.inventoryItem.update.mockResolvedValue({ availableQty: 98 });
      mockTx.outboxEvent.create.mockResolvedValue({});

      // Step 1: order.created → RESERVED
      mockPrisma.order.findFirst.mockResolvedValue({
        id: orderId,
        tenantId,
        customerId: 'cust-1',
        status: 'CREATED',
        items: [{ sku: 'SKU-A', qty: 2, price: 50 }],
      });
      await handleOrderMessage(prisma(), 'order.created', { orderId, tenantId });
      expect(statusHistory).toContain('RESERVED');

      // Step 2: order.confirmed → CONFIRMED + charge_requested outbox
      jest.clearAllMocks();
      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: any) => Promise<void>) => fn(mockTx),
      );
      mockPrisma.order.findFirst.mockResolvedValue({
        id: orderId,
        tenantId,
        customerId: 'cust-1',
        status: 'RESERVED',
        items: [{ sku: 'SKU-A', qty: 2, price: 50 }],
      });
      await handleOrderMessage(prisma(), 'order.confirmed', { orderId, tenantId });
      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CONFIRMED' } }),
      );
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'payment.charge_requested' }),
        }),
      );

      // Step 3: payment.settled → PAID
      jest.clearAllMocks();
      mockPrisma.order.findFirst.mockResolvedValue({
        id: orderId,
        tenantId,
        status: 'CONFIRMED',
      });
      await handlePaymentMessage(prisma(), 'payment.settled', { orderId, tenantId });
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: 'PAID' },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing order gracefully at every phase', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await handleOrderMessage(prisma(), 'order.created', { orderId: 'nope', tenantId: 't1' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      await handleOrderMessage(prisma(), 'order.confirmed', { orderId: 'nope', tenantId: 't1' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      await handlePaymentMessage(prisma(), 'payment.settled', { orderId: 'nope', tenantId: 't1' });
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it('should ignore unrecognized payment routing keys', async () => {
      await handlePaymentMessage(prisma(), 'payment.refunded', {
        orderId: 'o1',
        tenantId: 't1',
      });
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('should propagate correlationId through outbox events', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        customerId: 'cust-1',
        status: 'RESERVED',
        items: [{ sku: 'SKU-A', qty: 1, price: 10 }],
      });

      await handleOrderMessage(prisma(), 'order.confirmed', {
        orderId: 'o1',
        tenantId: 't1',
        correlationId: 'corr-tracked',
      });

      const outboxPayload = mockTx.outboxEvent.create.mock.calls[0][0].data.payload;
      expect(outboxPayload.correlationId).toBe('corr-tracked');
    });
  });
});
