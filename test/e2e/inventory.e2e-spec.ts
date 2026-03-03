import * as request from 'supertest';
import { v4 as uuid } from 'uuid';
import { TestContext, createTestApp, authHeaders } from './helpers/test-app';

describe('Inventory (e2e)', () => {
  let ctx: TestContext;
  const testSku = `E2E-INV-${Date.now()}`;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /v1/inventory — 200 list', async () => {
    const res = await request(ctx.url)
      .get('/v1/inventory')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /v1/inventory/adjustments — 201 with Idempotency-Key', async () => {
    const res = await request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }))
      .send({
        sku: testSku,
        type: 'IN',
        qty: 100,
        reason: 'E2E test stock-in',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.sku).toBe(testSku);
    expect(res.body.type).toBe('IN');
  });

  it('POST /v1/inventory/adjustments — 400 without Idempotency-Key', async () => {
    const res = await request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx))
      .send({
        sku: testSku,
        type: 'IN',
        qty: 10,
        reason: 'should fail',
      });

    expect(res.status).toBe(400);
  });

  it('POST /v1/inventory/adjustments — duplicate Idempotency-Key returns same response', async () => {
    const idemKey = uuid();

    const first = await request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx, { 'Idempotency-Key': idemKey }))
      .send({
        sku: testSku,
        type: 'IN',
        qty: 5,
        reason: 'idempotency test',
      });

    expect(first.status).toBe(201);

    const second = await request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx, { 'Idempotency-Key': idemKey }))
      .send({
        sku: testSku,
        type: 'IN',
        qty: 5,
        reason: 'idempotency test',
      });

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('GET /v1/inventory/adjustments — 200 list', async () => {
    const res = await request(ctx.url)
      .get('/v1/inventory/adjustments')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /v1/inventory/adjustments?sku=... — 200 filtered', async () => {
    const res = await request(ctx.url)
      .get(`/v1/inventory/adjustments?sku=${testSku}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const adj of res.body.data) {
      expect(adj.sku).toBe(testSku);
    }
  });

  it('POST /v1/inventory/adjustments — 409 OUT with insufficient stock', async () => {
    const res = await request(ctx.url)
      .post('/v1/inventory/adjustments')
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }))
      .send({
        sku: testSku,
        type: 'OUT',
        qty: 999999,
        reason: 'should fail: not enough stock',
      });

    expect(res.status).toBe(409);
  });
});
