# Identity Contract — JWT

node-b2b-orders **validates** JWT tokens issued by **spring-saas-core** (or a compatible issuer). It does **not** issue tokens itself.

## Token format

| Field | Type | Description |
|-------|------|-------------|
| `sub` | string (UUID) | User identifier |
| `tid` | string | Tenant identifier (must match `X-Tenant-Id` header) |
| `roles` | string[] | User roles (e.g. `admin`, `ops`, `sales`) |
| `perms` | string[] | Granted permissions (e.g. `orders:read`, `inventory:write`) |
| `plan` | string | Tenant subscription plan (e.g. `starter`, `pro`, `enterprise`) |
| `region` | string | Tenant region code (e.g. `br-south`, `us-east`) |
| `iss` | string | Token issuer — must match `JWT_ISSUER` env var |
| `exp` | number | Expiration timestamp (Unix epoch seconds) |
| `iat` | number | Issued-at timestamp (Unix epoch seconds) |

## Validation rules

1. **Signature** — HS256, verified against `JWT_SECRET`.
2. **Issuer** — `iss` must equal the configured `JWT_ISSUER` (default `local-auth`).
3. **Expiration** — Token must not be expired (`exp > now`).
4. **Tenant match** — `tid` claim must match the `X-Tenant-Id` request header (enforced by `TenantGuard`).
5. **Permissions** — Route-specific permissions checked via `PermissionsGuard` against the `perms` claim.
6. **ABAC** — Attribute-based policies evaluated by `AbacGuard` using `plan`, `region`, and other claims.

## Example decoded payload

```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tid": "tenant_demo",
  "roles": ["ops"],
  "perms": ["orders:read", "orders:write", "inventory:read", "inventory:write"],
  "plan": "pro",
  "region": "br-south",
  "iss": "spring-saas-core",
  "iat": 1709500000,
  "exp": 1709503600
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change-me` | Shared secret for HS256 verification |
| `JWT_ISSUER` | `local-auth` | Expected `iss` claim value |

In production, use the **same** `JWT_SECRET` and `JWT_ISSUER` configured in spring-saas-core.
