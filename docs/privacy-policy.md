# Privacy Policy — node-b2b-orders

Data privacy and handling policy for the B2B Orders and Inventory API.

Last updated: 2026-03-12

---

## 1. PII data handling

node-b2b-orders processes the minimum data required for order and inventory operations:

| Category | Data | Purpose |
|----------|------|---------|
| Order data | `customerId`, tenant ID, order items (SKU, qty, price) | Order lifecycle, fulfillment, payment integration |
| User identifiers | JWT `sub` claim (OIDC subject) | Authentication, ABAC evaluation, audit trail |
| Audit logs | `actorSub`, action, target, detail (IDs only), correlation ID | Security auditing, compliance |

**Important:** The `customerId` on orders is a tenant-defined identifier. When this identifier is an email or other PII, it is considered personal data and is subject to the same handling and retention policies as other PII.

- **No customer names or addresses** are stored in the Order model.
- **No payment card or bank data** — payment processing is delegated to py-payments-ledger; node-b2b-orders only publishes `payment.charge_requested` events with order metadata.
- **Audit logs** store `actorSub` (user identifier from JWT); the `detail` field contains only resource IDs (orderId, productId, itemCount), not names or emails.

---

## 2. Data retention policies

| Data type | Retention | Configuration |
|-----------|-----------|---------------|
| Orders | Retained while tenant is active | Soft-delete or purge on tenant deletion |
| Audit logs | Unlimited by default | `AuditLog` table; no automatic purge (see below) |
| Outbox events | Until dispatched and acknowledged | Events purged after successful RabbitMQ publish |

**Note:** Configurable audit retention (TTL/archival) is planned. Until implemented, operators should run periodic purge or archival jobs for records older than the desired retention (e.g., 90 days). See [`docs/compliance.md`](compliance.md).

---

## 3. Data access controls (ABAC, audit logging)

- **ABAC** — Attribute-Based Access Control with DENY precedence and default-deny. Policies evaluate `plan`, `region`, and other JWT claims before allowing access.
- **RBAC** — Permissions (e.g., `orders:read`, `orders:write`, `audit:read`) are checked via `PermissionsGuard`.
- **Tenant isolation** — `TenantGuard` enforces `X-Tenant-Id` header match with JWT `tid` claim; all queries are scoped by tenant.
- **Audit logging** — All sensitive actions (order create/confirm/cancel, inventory adjustments) and access denials (`ACCESS_DENIED`) are logged to `AuditLog` with actor, action, target, and correlation ID.

Access to audit data requires the `audit:read` permission and is tenant-scoped.

---

## 4. Data minimization practices

- Only essential fields are stored on Order: `customerId`, `tenantId`, `status`, items (SKU, qty, price).
- Outbox event payloads include only what downstream services need: `orderId`, `tenantId`, `customerId`, `items`, `totalAmount`, `currency`.
- Audit `detail` contains resource IDs and counts only; no PII is written to `detail` by design.
- Webhook payloads follow event contracts and do not add unnecessary fields.

---

## 5. Right to erasure considerations

- **Order deletion** — Orders can be soft-deleted or purged when a tenant is removed. Right-to-erasure requests for order data (including `customerId`) should be handled by the platform operator.
- **Audit logs** — Historical audit entries may retain `actorSub` and resource IDs. For erasure requests:
  - Anonymize or redact `actorSub` and `detail` in affected records within the retention window.
  - Purge records beyond retention when no longer required.
- **Cross-service erasure** — Events sent to py-payments-ledger and spring-saas-core (via RabbitMQ) are consumed once; erasure in node-b2b-orders does not automatically purge data in downstream services. Coordinate with platform operator for full erasure across services.

---

## 6. Encryption at rest and in transit

| Layer | Protection |
|-------|-------------|
| **Transport (TLS)** | All API traffic must use HTTPS. TLS 1.2+ recommended. |
| **Database** | PostgreSQL at-rest encryption depends on infrastructure (e.g., cloud provider disk encryption). Operators must enable encryption for production deployments. |
| **Redis** | Idempotency and rate-limiting data in Redis; enable Redis TLS and persistence encryption per operator policy. |
| **RabbitMQ** | Event bus traffic; use TLS for AMQS connections in production. |

---

## 7. Third-party data sharing

- **Internal platform only** — node-b2b-orders shares data with py-payments-ledger and spring-saas-core through the internal event bus (RabbitMQ) within the platform boundary.
- **Events to py-payments-ledger:** `payment.charge_requested` includes `orderId`, `tenantId`, `customerId`, `items`, `totalAmount`, `currency`. No card or bank data.
- **Events to spring-saas-core:** Not published by node-b2b-orders; spring-saas-core is the source of truth for tenants.
- **Webhooks** — Integrators may receive order lifecycle events via configurable webhook endpoints; payloads follow event contracts. Webhook URLs and delivery are tenant-configured.
- **No analytics, advertising, or data brokers** — No data is shared with third parties outside the platform.

---

## 8. Compliance references

node-b2b-orders follows privacy principles aligned with:

| Framework | Relevant principles |
|-----------|---------------------|
| **LGPD** (Brazil) | Purpose limitation, data minimization, transparency, security, data portability |
| **GDPR** (EU) | Lawfulness, purpose limitation, storage limitation, integrity and confidentiality |

Key capabilities:

- **Audit trail** of all sensitive actions and access denials
- **Tenant isolation** — data scoped per tenant
- **ABAC/RBAC** — default-deny access control
- **Data export** via `GET /v1/audit/export` for audit portability

For full compliance documentation, see [`docs/compliance.md`](compliance.md).

---

## 9. Contact for data requests

For data access, rectification, deletion or portability requests, contact the platform operator:

- **Email:** privacy@fluxe.io
- **Subject line:** `[Data Request] — <tenant name or ID>`
- **Expected response time:** 15 business days (aligned with LGPD Art. 18, §5)

The operator is the data controller. node-b2b-orders acts as the data processor providing order and inventory services for the B2B platform.
