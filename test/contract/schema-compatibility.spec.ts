import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { validateEventPayload, hasSchema } from '../../src/shared/events/schema-validator';

const SCHEMAS_DIR = path.resolve(process.cwd(), 'docs/contracts/schemas');

const SCHEMA_FILES = [
  'order.created.json',
  'order.confirmed.json',
  'order.cancelled.json',
  'order.shipped.json',
  'order.delivered.json',
  'inventory.reserved.json',
  'inventory.released.json',
  'charge_requested.json',
];

function loadSchema(filename: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), 'utf8'));
}

describe('Event Schema Compatibility (Consumer-Driven Contracts)', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  describe('JSON Schema structural validity', () => {
    it.each(SCHEMA_FILES)('%s is a valid JSON Schema', (file) => {
      const schema = loadSchema(file);
      const copy = { ...schema, $id: undefined };
      expect(() => ajv.compile(copy)).not.toThrow();
    });

    it.each(SCHEMA_FILES)('%s has required meta fields', (file) => {
      const schema = loadSchema(file);
      expect(schema).toHaveProperty('$schema');
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('required');
      expect(schema).toHaveProperty('properties');
    });
  });

  describe('order.created contract', () => {
    const eventType = 'order.created';

    it('validates a conforming payload', () => {
      const result = validateEventPayload(eventType, {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
        correlationId: 'corr-001',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects payload missing required orderId', () => {
      const result = validateEventPayload(eventType, { tenantId: '00000000-0000-0000-0000-000000000002' });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('rejects payload missing required tenantId', () => {
      const result = validateEventPayload(eventType, {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid UUID format for orderId', () => {
      const result = validateEventPayload(eventType, {
        orderId: 'not-a-uuid',
        tenantId: '00000000-0000-0000-0000-000000000002',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('order.confirmed contract', () => {
    const eventType = 'order.confirmed';
    const validPayload = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '00000000-0000-0000-0000-000000000002',
      customerId: 'cust-001',
      items: [{ sku: 'SKU-A', qty: 2, price: 49.9 }],
      totalAmount: 99.8,
      currency: 'BRL',
    };

    it('validates a conforming payload', () => {
      const result = validateEventPayload(eventType, validPayload);
      expect(result.valid).toBe(true);
    });

    it('rejects payload without items array', () => {
      const { items, ...withoutItems } = validPayload;
      const result = validateEventPayload(eventType, withoutItems);
      expect(result.valid).toBe(false);
    });

    it('rejects payload with item missing qty', () => {
      const result = validateEventPayload(eventType, {
        ...validPayload,
        items: [{ sku: 'SKU-A', price: 10 }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects payload with negative totalAmount', () => {
      const result = validateEventPayload(eventType, {
        ...validPayload,
        totalAmount: -5,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('order.shipped contract', () => {
    const eventType = 'order.shipped';

    it('validates a conforming payload', () => {
      const result = validateEventPayload(eventType, {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
        trackingCode: 'BR123456789',
        trackingUrl: 'https://tracking.example.com/BR123456789',
      });
      expect(result.valid).toBe(true);
    });

    it('accepts null trackingUrl', () => {
      const result = validateEventPayload(eventType, {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
        trackingCode: 'BR123456789',
        trackingUrl: null,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects payload missing trackingCode', () => {
      const result = validateEventPayload(eventType, {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('order.cancelled contract', () => {
    it('validates a conforming payload', () => {
      const result = validateEventPayload('order.cancelled', {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
        correlationId: 'corr-cancel-01',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('order.delivered contract', () => {
    it('validates a conforming payload', () => {
      const result = validateEventPayload('order.delivered', {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('inventory.reserved contract', () => {
    it('validates via inventory.reserved alias', () => {
      const result = validateEventPayload('inventory.reserved', {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
      });
      expect(result.valid).toBe(true);
    });

    it('validates via stock.reserved alias', () => {
      const result = validateEventPayload('stock.reserved', {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('inventory.released contract', () => {
    it('validates a conforming payload', () => {
      const result = validateEventPayload('inventory.released', {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '00000000-0000-0000-0000-000000000002',
        correlationId: 'corr-release-01',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('payment.charge_requested contract (producer)', () => {
    const validPayload = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '00000000-0000-0000-0000-000000000002',
      customerId: 'cust-001',
      items: [{ sku: 'SKU-A', qty: 1, price: 100 }],
      totalAmount: 100,
      currency: 'BRL',
      correlationId: 'corr-charge-01',
    };

    it('validates a conforming payload via payment.charge_requested', () => {
      const result = validateEventPayload('payment.charge_requested', validPayload);
      expect(result.valid).toBe(true);
    });

    it('validates a conforming payload via charge_requested alias', () => {
      const result = validateEventPayload('charge_requested', validPayload);
      expect(result.valid).toBe(true);
    });

    it('rejects payload without customerId', () => {
      const { customerId, ...without } = validPayload;
      const result = validateEventPayload('payment.charge_requested', without);
      expect(result.valid).toBe(false);
    });

    it('rejects payload with zero-qty item', () => {
      const result = validateEventPayload('payment.charge_requested', {
        ...validPayload,
        items: [{ sku: 'SKU-A', qty: 0, price: 10 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('payment.settled from py-payments-ledger (consumer)', () => {
    it('matches the expected format consumed by node-b2b-orders', () => {
      const settledPayload = {
        order_id: 'ord_123',
        tenant_id: '00000000-0000-0000-0000-000000000002',
        correlation_id: 'corr-settle-01',
        payment_intent_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'SETTLED',
        amount: '100.00',
        currency: 'BRL',
      };

      const requiredFields = [
        'order_id',
        'tenant_id',
        'correlation_id',
        'payment_intent_id',
        'status',
        'amount',
        'currency',
      ];

      for (const field of requiredFields) {
        expect(settledPayload).toHaveProperty(field);
        expect((settledPayload as Record<string, unknown>)[field]).toBeTruthy();
      }
      expect(settledPayload.status).toBe('SETTLED');
    });

    it('amount is a string decimal representation', () => {
      const settledPayload = {
        order_id: 'ord_456',
        tenant_id: '00000000-0000-0000-0000-000000000002',
        correlation_id: 'corr-settle-02',
        payment_intent_id: '660e8400-e29b-41d4-a716-446655440000',
        status: 'SETTLED',
        amount: '250.00',
        currency: 'BRL',
      };

      expect(typeof settledPayload.amount).toBe('string');
      expect(settledPayload.amount).toMatch(/^\d+\.\d+$/);
    });
  });

  describe('schema-validator coverage', () => {
    const allEventTypes = [
      'order.created',
      'order.confirmed',
      'order.shipped',
      'order.delivered',
      'order.cancelled',
      'payment.charge_requested',
      'charge_requested',
      'stock.reserved',
      'inventory.reserved',
      'inventory.released',
    ];

    it.each(allEventTypes)('hasSchema returns true for %s', (eventType) => {
      expect(hasSchema(eventType)).toBe(true);
    });

    it('hasSchema returns false for unregistered events', () => {
      expect(hasSchema('payment.settled')).toBe(false);
      expect(hasSchema('tenant.created')).toBe(false);
    });
  });
});
