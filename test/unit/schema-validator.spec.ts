import { validateEventPayload, hasSchema } from '../../src/shared/events/schema-validator';

describe('schema-validator', () => {
  describe('validateEventPayload', () => {
    it('should validate order.created payload', () => {
      const result = validateEventPayload('order.created', {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: 't1',
        correlationId: 'cid',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid order.created payload', () => {
      const result = validateEventPayload('order.created', {
        orderId: 'invalid-uuid',
        tenantId: 't1',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should validate order.confirmed payload', () => {
      const result = validateEventPayload('order.confirmed', {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: 't1',
        customerId: 'cust-1',
        items: [{ sku: 'S1', qty: 2, price: 10 }],
        totalAmount: 20,
        currency: 'BRL',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate charge_requested (payment.charge_requested) payload', () => {
      const result = validateEventPayload('payment.charge_requested', {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: 't1',
        customerId: 'cust-1',
        items: [{ sku: 'S1', qty: 1, price: 50 }],
        totalAmount: 50,
        currency: 'BRL',
      });
      expect(result.valid).toBe(true);
    });

    it('should return error for unknown event type', () => {
      const result = validateEventPayload('unknown.event', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown event type: unknown.event');
    });
  });

  describe('hasSchema', () => {
    it('should return true for known event types', () => {
      expect(hasSchema('order.created')).toBe(true);
      expect(hasSchema('order.confirmed')).toBe(true);
      expect(hasSchema('payment.charge_requested')).toBe(true);
      expect(hasSchema('inventory.reserved')).toBe(true);
    });

    it('should return false for unknown event types', () => {
      expect(hasSchema('unknown.event')).toBe(false);
    });
  });
});
