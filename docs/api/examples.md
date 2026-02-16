# API Examples

## Token
```bash
curl -sS -X POST http://localhost:3000/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@demo","password":"ops123","tenantId":"tenant_demo"}'
```

## Create order
```bash
curl -sS -X POST http://localhost:3000/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: tenant_demo" \
  -H "Idempotency-Key: demo-1" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"CUST-1","items":[{"sku":"SKU-1","qty":2,"price":10.5}] }'
```
