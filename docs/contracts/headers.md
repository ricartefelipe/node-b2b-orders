# Headers Contract

All authenticated API requests to node-b2b-orders must include the headers listed below.

## Required headers

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `Authorization` | Yes | Bearer JWT token issued by spring-saas-core | `Bearer eyJhbGci...` |
| `X-Tenant-Id` | Yes | Tenant identifier; must match the `tid` claim in the JWT | `tenant_demo` |

## Conditional headers

| Header | Required on | Description | Example |
|--------|-------------|-------------|---------|
| `Idempotency-Key` | `POST /v1/orders`, `POST /v1/orders/:id/confirm`, `POST /v1/inventory/adjustments` | Client-generated unique key to ensure at-most-once processing. Recommended format: `{operation}-{uuid}` or `{operation}-{timestamp}` | `create-order-550e8400-e29b` |

## Optional headers

| Header | Description | Default | Example |
|--------|-------------|---------|---------|
| `X-Correlation-Id` | Distributed tracing identifier propagated across services. Auto-generated (UUID without hyphens) if absent. | Auto-generated | `9f3a2b1c4d5e6f7a8b9c0d1e2f3a4b5c` |

## Response headers

| Header | Description |
|--------|-------------|
| `X-Correlation-Id` | Echoed back on every response |
| `X-RateLimit-Limit` | Max requests allowed in the current window (on 429) |
| `X-RateLimit-Remaining` | Remaining requests in the current window (on 429) |
| `Retry-After` | Seconds to wait before retrying (on 429) |

## Validation behavior

- **Missing `Authorization`** → 401 Unauthorized
- **Invalid/expired JWT** → 401 Unauthorized
- **Missing `X-Tenant-Id`** → 403 Forbidden (TenantGuard)
- **`X-Tenant-Id` ≠ JWT `tid`** → 403 Forbidden (TenantGuard)
- **Missing `Idempotency-Key`** on write endpoints → 400 Bad Request
- **Duplicate `Idempotency-Key`** → Returns cached response (HTTP 200/201) without re-processing
