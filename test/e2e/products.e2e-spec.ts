import request from 'supertest';
import { TestContext, createTestApp, authHeaders } from './helpers/test-app';

describe('Products (e2e)', () => {
  let ctx: TestContext;
  let createdProductId: string;
  const productSku = `E2E-SKU-${Date.now()}`;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /v1/products — 200 list', async () => {
    const res = await request(ctx.url)
      .get('/v1/products')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /v1/products — 201 create', async () => {
    const res = await request(ctx.url)
      .post('/v1/products')
      .set(authHeaders(ctx))
      .send({
        name: 'E2E Test Product',
        sku: productSku,
        price: 49.99,
        description: 'A product created during E2E testing',
        category: 'test-category',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('E2E Test Product');
    expect(res.body.sku).toBe(productSku);
    createdProductId = res.body.id;
  });

  it('POST /v1/products — 400 without required fields', async () => {
    const res = await request(ctx.url)
      .post('/v1/products')
      .set(authHeaders(ctx))
      .send({ description: 'Missing name, sku and price' });

    expect(res.status).toBe(400);
  });

  it('GET /v1/products/:id — 200', async () => {
    const res = await request(ctx.url)
      .get(`/v1/products/${createdProductId}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdProductId);
    expect(res.body.sku).toBe(productSku);
  });

  it('PATCH /v1/products/:id — 200 update', async () => {
    const res = await request(ctx.url)
      .patch(`/v1/products/${createdProductId}`)
      .set(authHeaders(ctx))
      .send({ name: 'Updated E2E Product', price: 59.99 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated E2E Product');
    expect(Number(res.body.price)).toBe(59.99);
  });

  it('DELETE /v1/products/:id — 200 soft delete', async () => {
    const res = await request(ctx.url)
      .delete(`/v1/products/${createdProductId}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('GET /v1/products/:id — 404 after soft delete', async () => {
    const res = await request(ctx.url)
      .get(`/v1/products/${createdProductId}`)
      .set(authHeaders(ctx));

    expect(res.status).toBe(404);
  });

  it('GET /v1/products/metadata/categories — 200', async () => {
    const res = await request(ctx.url)
      .get('/v1/products/metadata/categories')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/products/metadata/price-range — 200', async () => {
    const res = await request(ctx.url)
      .get('/v1/products/metadata/price-range')
      .set(authHeaders(ctx));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('min');
    expect(res.body).toHaveProperty('max');
  });
});
