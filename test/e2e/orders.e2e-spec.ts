import request from 'supertest';
import { v4 as uuid } from 'uuid';
import { TestContext, createTestApp, authHeaders } from './helpers/test-app';

describe('Orders (e2e)', () => {
  let ctx: TestContext;
  let createdOrderId: string;
  const idempotencyKey = uuid();

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('POST /v1/orders — 400 without Idempotency-Key', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx))
      .send({
        customerId: 'CUST-E2E',
        items: [{ sku: 'SKU-1', qty: 2, price: 25.0 }],
      });

    expect(res.status).toBe(400);
  });

  it('POST /v1/orders — 201 with Idempotency-Key', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': idempotencyKey }))
      .send({
        customerId: 'CUST-E2E',
        items: [{ sku: 'SKU-1', qty: 2, price: 25.0 }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('CREATED');
    createdOrderId = res.body.id;
  });

  it('POST /v1/orders — duplicate Idempotency-Key returns same response', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': idempotencyKey }))
      .send({
        customerId: 'CUST-E2E',
        items: [{ sku: 'SKU-1', qty: 2, price: 25.0 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdOrderId);
  });

  it('GET /v1/orders/:id — 200', async () => {
    const res = await request(ctx.url)
      .get(`/v1/orders/${createdOrderId}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdOrderId);
    expect(res.body).toHaveProperty('items');
  });

  it('POST /v1/orders/:id/confirm — 409 when status is CREATED (not RESERVED)', async () => {
    const res = await request(ctx.url)
      .post(`/v1/orders/${createdOrderId}/confirm`)
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }));

    expect(res.status).toBe(409);
  });

  it('POST /v1/orders/:id/cancel — 200', async () => {
    const res = await request(ctx.url)
      .post(`/v1/orders/${createdOrderId}/cancel`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('GET /v1/orders?status=CANCELLED — 200 with filter', async () => {
    const res = await request(ctx.url)
      .get('/v1/orders?status=CANCELLED')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /v1/orders/:id — 404 for non-existent', async () => {
    const res = await request(ctx.url)
      .get(`/v1/orders/${uuid()}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(404);
  });
});
