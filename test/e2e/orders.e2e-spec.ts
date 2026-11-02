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
        items: [{ sku: 'ELET-001', qty: 2 }],
      });

    expect(res.status).toBe(400);
  });

  it('POST /v1/orders — 201 with Idempotency-Key', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': idempotencyKey }))
      .send({
        customerId: 'CUST-E2E',
        items: [{ sku: 'ELET-001', qty: 2 }],
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
        items: [{ sku: 'ELET-001', qty: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdOrderId);
  });

  it('POST /v1/orders — preço e total vêm do catálogo', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }))
      .send({ customerId: 'CUST-PRECO', items: [{ sku: 'ELET-003', qty: 3 }] });
    expect(res.status).toBe(201);
    const order = await request(ctx.url).get(`/v1/orders/${res.body.id}`).set(authHeaders(ctx));
    expect(Number(order.body.items[0].price)).toBe(489.9);
    expect(Number(order.body.totalAmount)).toBe(1469.7);
  });

  it('POST /v1/orders — 409 quando o preço informado diverge do catálogo', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }))
      .send({ customerId: 'CUST-PRECO', items: [{ sku: 'ELET-003', qty: 1, price: 0.01 }] });
    expect(res.status).toBe(409);
  });

  it('POST /v1/orders — 422 para SKU fora do catálogo', async () => {
    const res = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': uuid() }))
      .send({ customerId: 'CUST-PRECO', items: [{ sku: 'SKU-INEXISTENTE', qty: 1 }] });
    expect(res.status).toBe(422);
  });

  it('POST /v1/orders — 409 when the same Idempotency-Key carries a different payload', async () => {
    const key = uuid();
    const first = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': key }))
      .send({ customerId: 'CUST-IDEM', items: [{ sku: 'ELET-001', qty: 1 }] });
    expect(first.status).toBe(201);
    const changed = await request(ctx.url)
      .post('/v1/orders')
      .set(authHeaders(ctx, { 'Idempotency-Key': key }))
      .send({ customerId: 'CUST-IDEM', items: [{ sku: 'ELET-001', qty: 7 }] });
    expect(changed.status).toBe(409);
    const same = await request(ctx.url)
      .get(`/v1/orders/${first.body.id}`)
      .set(authHeaders(ctx));
    expect(same.body.items[0].qty).toBe(1);
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
