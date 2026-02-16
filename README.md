# node-b2b-orders

NestJS + Prisma demo: **Orders + Inventory** with **outbox**, **worker**, **idempotency**, **RBAC/ABAC**, **Redis rate limit**, and **Prometheus/Grafana**.

## Quickstart
```bash
cp .env.example .env
./scripts/up.sh
./scripts/migrate.sh
./scripts/seed.sh
./scripts/smoke.sh
```

URLs:
- API docs: http://localhost:3000/docs
- Rabbit UI: http://localhost:15673 (guest/guest)
- Prometheus: http://localhost:9091
- Grafana: http://localhost:3001 (admin/admin)

## Demo credentials
- Global admin: `admin@local` / `admin123`
- Ops: `ops@demo` / `ops123` (tenant_demo)
- Sales: `sales@demo` / `sales123` (tenant_demo)

## Docs
- OpenAPI served via Swagger at `/docs`
- Export to `docs/api/openapi.{json,yaml}`: `./scripts/api-export.sh`
- Examples: `docs/api/examples.md`

## Why this matters
This repo focuses on correctness under production-ish constraints: tenant isolation, idempotency, eventual consistency via outbox/worker, and policy-driven authorization.

## License
MIT
