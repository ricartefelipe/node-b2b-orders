# Contract Versioning Changelog — node-b2b-orders

This document records breaking changes to the REST API and event contracts. It establishes the baseline (v1.0.0) and defines the format, policy, and deprecation process for future versions.

See [events.md](events.md), [identity.md](identity.md), and [headers.md](headers.md) for the full contract specifications.

---

## Versioning policy

### REST API

- **Versioning model:** URL path prefix (`/v1/`, `/v2/`, …).
- **Semantic versioning:** API versions follow `MAJOR.MINOR` (e.g. v1.0, v2.0).
  - **MAJOR:** Breaking changes (removed/renamed endpoints, incompatible request/response shapes).
  - **MINOR:** Non-breaking additions (new endpoints, new optional fields).
- **Current stable:** `v1` (v1.0.0 baseline).
- **Backward compatibility:** Within a major version (e.g. v1.x), breaking changes are not allowed. New minor versions may add optional fields or new endpoints.

### Events (RabbitMQ)

- **Schema versioning:** Event payloads may include a `schemaVersion` or `eventVersion` field. When omitted, `1` is assumed.
- **Compatibility:** Consumers must tolerate extra fields (forward compatibility). Producers must not remove or rename existing fields without a new schema version.
- **Breaking changes:** Removing fields, renaming fields, or changing types in existing events require a new schema version and must be documented here.

---

## Deprecation process

1. **Announce** — Add a deprecation notice in this changelog and in API responses (e.g. `Deprecation` header or `X-API-Deprecation`).
2. **Deprecate** — Mark the contract as deprecated. Minimum 6 months from announce.
3. **Remove** — Remove the deprecated contract in the next major version. Minimum 3 months from deprecate.

| Phase    | Minimum duration | Actions                                                                 |
|----------|------------------|-------------------------------------------------------------------------|
| Announce | —                | Document in changelog, add `Deprecation` header, notify integrators      |
| Deprecate| 6 months         | Mark deprecated, return warnings if configured                         |
| Remove   | 3 months after deprecate | Remove in next MAJOR; keep previous major available during overlap |

---

## Contract surface (v1.0.0 baseline)

### REST API — Endpoints

| Method | Path | Idempotency-Key | Description |
|--------|------|-----------------|-------------|
| POST | `/v1/orders` | Required | Create order |
| GET | `/v1/orders` | — | List orders (query: `status`) |
| GET | `/v1/orders/:id` | — | Get order by ID |
| POST | `/v1/orders/:id/confirm` | Required | Confirm order |
| POST | `/v1/orders/:id/cancel` | — | Cancel order |
| GET | `/v1/products` | — | List products |
| POST | `/v1/products` | — | Create product |
| GET | `/v1/products/:id` | — | Get product by ID |
| PATCH | `/v1/products/:id` | — | Update product |
| DELETE | `/v1/products/:id` | — | Soft delete product |
| GET | `/v1/products/metadata/categories` | — | List categories |
| GET | `/v1/products/metadata/price-range` | — | Get price range |
| GET | `/v1/inventory` | — | List inventory |
| POST | `/v1/inventory/adjustments` | Required | Create inventory adjustment |
| GET | `/v1/inventory/adjustments` | — | List adjustments (query: `sku`) |
| GET | `/v1/audit` | — | List audit log |
| GET | `/v1/audit/export` | — | Export audit log |
| POST | `/v1/auth/token` | — | Issue token (dev) |
| GET | `/v1/me` | — | Current user from JWT |
| GET | `/v1/healthz` | — | Liveness probe |
| GET | `/v1/readyz` | — | Readiness probe |
| GET | `/v1/metrics` | — | Prometheus metrics |
| GET | `/v1/admin/chaos` | — | Get chaos config |
| PUT | `/v1/admin/chaos` | — | Set chaos config |

### Events — Published (exchange `orders.x`)

| Event | Routing Key | Description |
|-------|-------------|-------------|
| `order.created` | `order.created` | Order created |
| `order.reserved` | `order.reserved` | Inventory reserved |
| `order.confirmed` | `order.confirmed` | Order confirmed |
| `order.cancelled` | `order.cancelled` | Order cancelled |
| `order.paid` | `order.paid` | Payment settled; order marked paid |
| `payment.charge_requested` | — | Published to `payments.x` when order confirmed |

### Events — Consumed

| Source | Event | Queue | Description |
|--------|-------|-------|-------------|
| py-payments-ledger | `payment.settled` | `orders.payments` | Updates order; publishes `order.paid` |

### Headers

See [headers.md](headers.md).

| Header | Required | Notes |
|--------|----------|-------|
| `Authorization` | Yes | Bearer JWT |
| `X-Tenant-Id` | Yes | Must match JWT `tid` |
| `Idempotency-Key` | Conditional | Required on POST orders, confirm, inventory adjustments |
| `X-Correlation-Id` | Optional | Auto-generated if absent |

### Identity (JWT)

See [identity.md](identity.md). Validates JWT from spring-saas-core; does not issue tokens (except dev).

---

## Changelog format

For each release that introduces breaking changes, add an entry:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### BREAKING

- **REST:** Description of change. Migration: …
- **Events:** Description. Migration: …

### Added

- Non-breaking additions.
```

---

## Release history

### [1.0.0] - Baseline

Initial v1 contract surface. All endpoints and events listed above are the baseline. No breaking changes recorded.
