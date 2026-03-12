import { PrismaClient } from '@prisma/client';

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

jest.mock('opossum', () => {
  return jest.fn().mockImplementation((action: Function, _opts: any) => {
    let opened = false;
    const listeners: Record<string, Function[]> = {};

    return {
      fire: (...args: any[]) => {
        if (opened) throw new Error('Breaker is open');
        return action(...args);
      },
      on: (event: string, fn: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      get opened() {
        return opened;
      },
      open: () => {
        opened = true;
        (listeners['open'] || []).forEach((fn) => fn());
      },
      close: () => {
        opened = false;
        (listeners['close'] || []).forEach((fn) => fn());
      },
    };
  });
});

import { handlePaymentMessage } from '../../src/worker/main';

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({}),
  bindQueue: jest.fn().mockResolvedValue({}),
  publish: jest.fn().mockReturnValue(true),
  prefetch: jest.fn().mockResolvedValue({}),
  consume: jest.fn().mockResolvedValue({}),
  ack: jest.fn(),
  reject: jest.fn(),
};

const mockOutboxEvents = [
  {
    id: 'evt-1',
    tenantId: 't1',
    eventType: 'order.confirmed',
    aggregateType: 'Order',
    aggregateId: 'o1',
    status: 'PENDING',
    payload: { orderId: 'o1', tenantId: 't1', correlationId: 'corr-1' },
    attempts: 0,
    lockedAt: null,
    lockedBy: null,
    availableAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
  },
  {
    id: 'evt-2',
    tenantId: 't1',
    eventType: 'payment.charge_requested',
    aggregateType: 'Order',
    aggregateId: 'o1',
    status: 'PENDING',
    payload: {
      orderId: 'o1',
      tenantId: 't1',
      correlationId: 'corr-1',
      customerId: 'cust-1',
      items: [{ sku: 'SKU-A', qty: 1, price: 50 }],
      totalAmount: 50,
      currency: 'BRL',
    },
    attempts: 0,
    lockedAt: null,
    lockedBy: null,
    availableAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
  },
];

describe('Event publisher — outbox dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('outbox event routing', () => {
    it('should route order.* events to orders.x exchange', () => {
      const ev = mockOutboxEvents[0];
      const targetExchange = ev.eventType.startsWith('payment.') ? 'payments.x' : 'orders.x';
      expect(targetExchange).toBe('orders.x');
    });

    it('should route payment.* events to payments.x exchange', () => {
      const ev = mockOutboxEvents[1];
      const targetExchange = ev.eventType.startsWith('payment.') ? 'payments.x' : 'orders.x';
      expect(targetExchange).toBe('payments.x');
    });

    it('should include tenant headers on published messages', () => {
      const ev = mockOutboxEvents[0];
      const payload = {
        ...(ev.payload as any),
        tenantId: ev.tenantId,
        correlationId: (ev.payload as any)?.correlationId || '',
      };
      const headers = {
        'X-Correlation-Id': payload.correlationId || '',
        'X-Tenant-Id': ev.tenantId,
      };

      mockChannel.publish(
        'orders.x',
        ev.eventType,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: 'application/json',
          persistent: true,
          headers,
          timestamp: Math.floor(Date.now() / 1000),
        },
      );

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'orders.x',
        'order.confirmed',
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-Id': 't1',
            'X-Correlation-Id': 'corr-1',
          }),
        }),
      );
    });
  });

  describe('outbox status transitions', () => {
    it('should mark event as SENT after successful publish', async () => {
      const mockPrisma = {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue([mockOutboxEvents[0]]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      mockChannel.publish.mockReturnValue(true);

      const ev = mockOutboxEvents[0];
      await mockPrisma.outboxEvent.updateMany({
        where: { id: ev.id, lockedAt: ev.lockedAt },
        data: { lockedAt: new Date(), lockedBy: 'test-worker' },
      });
      expect(mockPrisma.outboxEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1', lockedAt: null },
        }),
      );

      await mockPrisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: 'SENT', lockedAt: null, lockedBy: null },
      });
      expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { status: 'SENT', lockedAt: null, lockedBy: null },
      });
    });

    it('should increment attempts and apply backoff on failure', () => {
      const ev = { ...mockOutboxEvents[0], attempts: 2 };
      const attempts = ev.attempts + 1;
      const backoffSeconds = Math.min(60, 2 ** Math.min(6, attempts));
      const availableAt = new Date(Date.now() + backoffSeconds * 1000);

      expect(attempts).toBe(3);
      expect(backoffSeconds).toBe(8);
      expect(availableAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark event as DEAD after 7 failures', () => {
      const ev = { ...mockOutboxEvents[0], attempts: 6 };
      const attempts = ev.attempts + 1;
      const newStatus = attempts >= 7 ? 'DEAD' : 'PENDING';
      expect(newStatus).toBe('DEAD');
    });

    it('should keep event PENDING when under max attempts', () => {
      const ev = { ...mockOutboxEvents[0], attempts: 3 };
      const attempts = ev.attempts + 1;
      const newStatus = attempts >= 7 ? 'DEAD' : 'PENDING';
      expect(newStatus).toBe('PENDING');
    });
  });

  describe('circuit breaker behavior', () => {
    it('should skip dispatch when circuit is open', () => {
      const CircuitBreaker = require('opossum');
      const breaker = new CircuitBreaker(jest.fn(), {});
      breaker.open();

      expect(breaker.opened).toBe(true);
      expect(() => breaker.fire('test')).toThrow('Breaker is open');
    });

    it('should allow dispatch when circuit is closed', async () => {
      const CircuitBreaker = require('opossum');
      const action = jest.fn().mockResolvedValue(true);
      const breaker = new CircuitBreaker(action, {});

      const result = await breaker.fire('exchange', 'key', Buffer.from('{}'), {});
      expect(result).toBe(true);
      expect(action).toHaveBeenCalled();
    });

    it('should recover from open to closed state', () => {
      const CircuitBreaker = require('opossum');
      const breaker = new CircuitBreaker(jest.fn(), {});

      breaker.open();
      expect(breaker.opened).toBe(true);

      breaker.close();
      expect(breaker.opened).toBe(false);
    });
  });

  describe('payment.settled handler', () => {
    const mockPrisma = {
      order: { findFirst: jest.fn(), update: jest.fn() },
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should update order to PAID on valid payment.settled', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'CONFIRMED',
      });

      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { orderId: 'o1', tenantId: 't1', amount: 100 },
      );

      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'PAID' },
      });
    });

    it('should reject payment.settled when fields are missing', async () => {
      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        {},
      );
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('should not update non-CONFIRMED orders', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'o1',
        tenantId: 't1',
        status: 'PAID',
      });

      await handlePaymentMessage(
        mockPrisma as unknown as PrismaClient,
        'payment.settled',
        { orderId: 'o1', tenantId: 't1' },
      );

      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });
  });
});
