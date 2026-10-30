import request from 'supertest';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { AuditService } from '../../src/shared/audit/audit.service';
import { TestContext, createTestApp, authHeaders } from './helpers/test-app';

/**
 * Idempotência durável: o efeito de negócio e o registro da chave vivem na mesma transação.
 * As provas conferem o estado (quantidade em estoque, ajustes e pedidos persistidos), não só o HTTP.
 */
describe('Idempotency (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.app.get(PrismaService);
    redis = ctx.app.get(RedisService);
  }, 30_000);

  afterAll(async () => {
    await ctx.app.close();
  });

  const adjust = (key: string, body: Record<string, unknown>) =>
    request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx, { 'Idempotency-Key': key }))
      .send(body);

  const availableQty = async (sku: string) =>
    (await prisma.inventoryItem.findUnique({ where: { tenantId_sku: { tenantId: ctx.tenantId, sku } } }))?.availableQty ?? 0;

  const adjustmentsFor = (sku: string) => prisma.inventoryAdjustment.count({ where: { tenantId: ctx.tenantId, sku } });

  describe('inventory adjustments', () => {
    it('same key and same payload: one effect, same adjustment, stock moves once', async () => {
      const sku = `IDEM-SAME-${Date.now()}`;
      const key = uuid();
      const body = { sku, type: 'IN', qty: 7, reason: 'replay' };

      const first = await adjust(key, body);
      const second = await adjust(key, body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await availableQty(sku)).toBe(7);
      expect(await adjustmentsFor(sku)).toBe(1);
    });

    it('same key and different payload: 409 and no new effect', async () => {
      const sku = `IDEM-DIFF-${Date.now()}`;
      const key = uuid();

      const first = await adjust(key, { sku, type: 'IN', qty: 3, reason: 'original' });
      const changed = await adjust(key, { sku, type: 'IN', qty: 30, reason: 'original' });

      expect(first.status).toBe(201);
      expect(changed.status).toBe(409);
      expect(await availableQty(sku)).toBe(3);
      expect(await adjustmentsFor(sku)).toBe(1);
    });

    it('concurrent requests with the same key apply the effect exactly once', async () => {
      const sku = `IDEM-CONC-${Date.now()}`;
      const key = uuid();
      const body = { sku, type: 'IN', qty: 5, reason: 'concurrent' };

      const responses = await Promise.all(Array.from({ length: 6 }, () => adjust(key, body)));

      const statuses = responses.map((r) => r.status);
      expect(statuses.every((s) => s === 201)).toBe(true);
      expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
      expect(await availableQty(sku)).toBe(5);
      expect(await adjustmentsFor(sku)).toBe(1);
    });

    it('concurrent adjustments with different keys never lose an update', async () => {
      const sku = `IDEM-ATOMIC-${Date.now()}`;
      await adjust(uuid(), { sku, type: 'IN', qty: 100, reason: 'seed' });

      const ins = Array.from({ length: 8 }, () => adjust(uuid(), { sku, type: 'IN', qty: 1, reason: 'parallel in' }));
      const outs = Array.from({ length: 8 }, () => adjust(uuid(), { sku, type: 'OUT', qty: 1, reason: 'parallel out' }));
      const responses = await Promise.all([...ins, ...outs]);

      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(await availableQty(sku)).toBe(100);
      expect(await adjustmentsFor(sku)).toBe(17);
    });

    it('OUT beyond the available quantity is refused atomically under concurrency', async () => {
      const sku = `IDEM-OVERSELL-${Date.now()}`;
      await adjust(uuid(), { sku, type: 'IN', qty: 5, reason: 'seed' });

      const outs = await Promise.all(Array.from({ length: 10 }, () => adjust(uuid(), { sku, type: 'OUT', qty: 1, reason: 'race' })));

      expect(outs.filter((r) => r.status === 201)).toHaveLength(5);
      expect(outs.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await availableQty(sku)).toBe(0);
    });

    it('losing the Redis entry does not allow a second effect', async () => {
      const sku = `IDEM-REDIS-${Date.now()}`;
      const key = uuid();
      const body = { sku, type: 'IN', qty: 4, reason: 'cache lost' };

      const first = await adjust(key, body);
      await redis.idemDelete(`idem:${ctx.tenantId}:inventory-adjustment:${key}`);
      const replay = await adjust(key, body);
      const changed = await adjust(key, { ...body, qty: 40 });

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(changed.status).toBe(409);
      expect(await availableQty(sku)).toBe(4);
      expect(await adjustmentsFor(sku)).toBe(1);
    });

    it('a crash after the effect and before the response replays the durable record', async () => {
      const sku = `IDEM-CRASH-${Date.now()}`;
      const key = uuid();
      const body = { sku, type: 'IN', qty: 9, reason: 'crash' };
      const audit = ctx.app.get(AuditService);
      const failing = jest.spyOn(audit, 'log').mockRejectedValueOnce(new Error('process died before responding'));

      const crashed = await adjust(key, body);
      failing.mockRestore();
      const replay = await adjust(key, body);

      expect(crashed.status).toBe(500);
      expect(await availableQty(sku)).toBe(9);
      expect(replay.status).toBe(201);
      expect(replay.body.sku).toBe(sku);
      expect(await adjustmentsFor(sku)).toBe(1);
      expect(await availableQty(sku)).toBe(9);
    });

    it('a legacy cache entry without fingerprint is checked against the persisted adjustment', async () => {
      const sku = `IDEM-LEGACY-${Date.now()}`;
      const key = uuid();
      const first = await adjust(key, { sku, type: 'IN', qty: 2, reason: 'legacy' });
      expect(first.status).toBe(201);

      // Formato gravado pelas versões anteriores: o ajuste em si, sem impressão digital, e sem registro durável.
      await prisma.idempotencyRecord.delete({
        where: { tenantId_scope_key: { tenantId: ctx.tenantId, scope: 'inventory-adjustment', key } },
      });
      await redis.idemSet(`idem:${ctx.tenantId}:inventory-adjustment:${key}`, first.body, 3600);

      const replay = await adjust(key, { sku, type: 'IN', qty: 2, reason: 'legacy' });
      const changed = await adjust(key, { sku, type: 'IN', qty: 20, reason: 'legacy' });

      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(changed.status).toBe(409);
      expect(await availableQty(sku)).toBe(2);
      expect(await adjustmentsFor(sku)).toBe(1);
    });
  });

  describe('order creation', () => {
    const createOrder = (key: string, body: Record<string, unknown>) =>
      request(ctx.url).post('/v1/orders').set(authHeaders(ctx, { 'Idempotency-Key': key })).send(body);

    it('losing the Redis entry does not create a second order', async () => {
      const key = uuid();
      const customerId = `CUST-IDEM-${Date.now()}`;
      const body = { customerId, items: [{ sku: 'SKU-1', qty: 1, price: 10 }] };

      const first = await createOrder(key, body);
      await redis.idemDelete(`idem:${ctx.tenantId}:create-order:${key}`);
      const replay = await createOrder(key, body);

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(await prisma.order.count({ where: { tenantId: ctx.tenantId, customerId } })).toBe(1);
    });

    it('concurrent creations with the same key persist exactly one order', async () => {
      const key = uuid();
      const customerId = `CUST-CONC-${Date.now()}`;
      const body = { customerId, items: [{ sku: 'SKU-1', qty: 2, price: 10 }] };

      const responses = await Promise.all(Array.from({ length: 6 }, () => createOrder(key, body)));

      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.order.count({ where: { tenantId: ctx.tenantId, customerId } })).toBe(1);
    });
  });
});
