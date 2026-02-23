# node-b2b-orders

API B2B de Pedidos e Inventário implementada com **NestJS + Fastify**, **Prisma**, **PostgreSQL**, **Redis** e **RabbitMQ**.

Padrões implementados: **Outbox Pattern**, **Worker Assíncrono**, **Idempotência**, **RBAC/ABAC**, **Rate Limiting**, **Multi-tenancy** e **Observabilidade** (Prometheus/Grafana).

## Arquitetura

```
Cliente HTTP
   │ JWT + X-Tenant-Id + X-Correlation-Id
   ▼
┌──────────────────────────────┐
│  API REST (NestJS + Fastify) │
│  Guards: JWT → Tenant →      │
│  Permissions → ABAC          │
└────────┬────────────┬────────┘
         │            │
    ┌────▼────┐  ┌────▼────┐
    │Postgres │  │ Redis   │
    │(Outbox) │  │(Cache)  │
    └────┬────┘  └─────────┘
         │ Dispatch
    ┌────▼────────┐
    │  RabbitMQ   │
    │  orders.x   │◄──── payments.x (py-payments-ledger)
    └────┬────────┘
    ┌────▼────────────┐
    │ Worker Process   │
    │ - outbox dispatch│
    │ - stock reserve  │
    │ - payment events │
    └──────────────────┘
```

## Quick Start

### Pré-requisitos

- Docker & Docker Compose
- Node.js 20+

### Setup (one command)

```bash
git clone https://github.com/ricartefelipe/node-b2b-orders.git
cd node-b2b-orders

# Subir infraestrutura + API + Worker
./scripts/up.sh

# Migrar banco
./scripts/migrate.sh

# Seed com dados de teste
./scripts/seed.sh

# Smoke tests (valida order→reserved→confirmed)
./scripts/smoke.sh
```

## Demo Script (3–5 minutos)

Para apresentar o sistema em uma demo:

1. **Subir stack:** `./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh`
2. **Swagger:** Abrir http://localhost:3000/docs
3. **Auth:** `POST /v1/auth/token` com `{"email":"ops@demo","password":"ops123","tenantId":"tenant_demo"}`
4. **Criar pedido:** `POST /v1/orders` com header `Idempotency-Key: demo-$(date +%s)` e body `{"customerId":"CUST-1","items":[{"sku":"SKU-1","qty":2,"price":10.5}]}`
5. **Aguardar worker:** ~2–3s e buscar `GET /v1/orders/{id}` — status deve ir CREATED → RESERVED
6. **Confirmar:** `POST /v1/orders/{id}/confirm` com `Idempotency-Key: demo-confirm-$(date +%s)`
7. **Fluxo payments:** Worker publica `payment.charge_requested` em `payments.x`; py-payments-ledger (se rodando) publica `payment.settled`; worker atualiza para PAID.

Para validar tudo de uma vez: `./scripts/smoke.sh`

## URLs e Credenciais

| Serviço    | URL                     | Credenciais |
|-----------|-------------------------|-------------|
| Swagger UI| http://localhost:3000/docs | -        |
| RabbitMQ  | http://localhost:15673   | guest/guest |
| Prometheus| http://localhost:9091   | -           |
| Grafana   | http://localhost:3001    | admin/admin |
| PostgreSQL| localhost:5433          | app/app     |
| Redis     | localhost:6380          | -           |

### Usuários de Teste

| Email      | Senha     | Tenant       | Role  | Permissões                    |
|------------|-----------|--------------|-------|-------------------------------|
| admin@local| admin123  | * (global)   | admin | todas                         |
| ops@demo   | ops123    | tenant_demo  | ops   | orders:rw, inventory:rw, profile:r |
| sales@demo | sales123  | tenant_demo  | sales | orders:r, inventory:r, profile:r |

## Endpoints

### Auth

- `POST /v1/auth/token` — Emitir JWT
- `GET /v1/me` — Dados do usuário autenticado

### Orders

- `POST /v1/orders` — Criar pedido (requer `Idempotency-Key`)
- `POST /v1/orders/:id/confirm` — Confirmar pedido reservado
- `POST /v1/orders/:id/cancel` — Cancelar pedido
- `GET /v1/orders/:id` — Detalhe do pedido
- `GET /v1/orders` — Listar pedidos (filtro: `?status=`)

### Inventory

- `GET /v1/inventory` — Listar estoque (filtro: `?sku=`)
- `POST /v1/inventory/adjustments` — Criar ajuste (IN/OUT/ADJUSTMENT)
- `GET /v1/inventory/adjustments` — Listar ajustes (filtro: `?sku=`)

### Admin

- `GET /v1/admin/chaos` — Config de chaos engineering
- `PUT /v1/admin/chaos` — Atualizar chaos config

### Observabilidade

- `GET /v1/metrics` — Métricas Prometheus
- `GET /v1/healthz` — Health check
- `GET /v1/readyz` — Readiness (DB + Redis)

## Eventos (RabbitMQ)

| Evento                  | Exchange   | Origem        | Consumidor          |
|-------------------------|------------|---------------|---------------------|
| order.created           | orders.x   | API (outbox)  | Worker              |
| order.confirmed         | orders.x   | API (outbox)  | Worker              |
| order.cancelled         | orders.x   | API/Worker    | Worker              |
| payment.charge_requested | payments.x | Worker (outbox)| py-payments-ledger |
| payment.settled         | payments.x | py-payments-ledger | Worker      |

Contratos detalhados em [`docs/contracts/events.md`](docs/contracts/events.md).

## Auth e Headers

- **Headers obrigatórios:** `Authorization: Bearer <JWT>`, `X-Tenant-Id`
- **Headers opcionais:** `X-Correlation-Id` (gerado se ausente)
- **Idempotency-Key:** Obrigatório em `POST /v1/orders`, `POST /v1/orders/:id/confirm`, `POST /v1/inventory/adjustments`

Documentação: [`docs/contracts/identity.md`](docs/contracts/identity.md), [`docs/contracts/headers.md`](docs/contracts/headers.md).

## Fluxo do Pedido

```
CREATED → (worker reserva estoque) → RESERVED → (confirm) → CONFIRMED → (payment.settled) → PAID
                                    → (cancel)  → CANCELLED
         → (sem estoque)           → CANCELLED
```

1. `POST /v1/orders` cria pedido com status `CREATED` e evento outbox `order.created`
2. Worker consome `order.created`: reserva estoque ou cancela se insuficiente
3. `POST /v1/orders/:id/confirm` muda para `CONFIRMED` e gera evento `order.confirmed`
4. Worker consome `order.confirmed`: libera reserva e cria outbox `payment.charge_requested`
5. Outbox dispatcher publica `payment.charge_requested` no exchange `payments.x`
6. Serviço de pagamentos (py-payments-ledger) processa e publica `payment.settled`
7. Worker consome `payment.settled` e atualiza para `PAID`

## Métricas de Negócio

Disponíveis em `/v1/metrics` (formato Prometheus):

```
orders_created_total{tenant_id="tenant_demo"}
orders_confirmed_total{tenant_id="tenant_demo"}
orders_cancelled_total{tenant_id="tenant_demo"}
inventory_reserved_total{tenant_id="tenant_demo"}
inventory_adjusted_total{tenant_id="tenant_demo",type="IN"}
```

## Variáveis de Ambiente

| Variável             | Default                 | Descrição                    |
|----------------------|-------------------------|------------------------------|
| HTTP_PORT            | 3000                    | Porta da API                 |
| DATABASE_URL         | -                       | Connection string PostgreSQL |
| REDIS_URL            | redis://localhost:6379  | Connection string Redis      |
| RABBITMQ_URL         | amqp://guest:guest@localhost:5672 | Connection string RabbitMQ |
| JWT_SECRET           | change-me               | Secret para JWT HS256        |
| JWT_ISSUER           | local-auth              | Issuer do token              |
| TOKEN_EXPIRES_SECONDS| 3600                    | TTL do token                 |
| RATE_LIMIT_WRITE_PER_MIN | 60                 | Limite de escrita por minuto |
| RATE_LIMIT_READ_PER_MIN  | 240                 | Limite de leitura por minuto |
| ORDERS_EXCHANGE      | orders.x                | Exchange de pedidos          |
| PAYMENTS_EXCHANGE    | payments.x              | Exchange de pagamentos       |
| PAYMENTS_INBOUND_QUEUE | orders.payments       | Fila de eventos de pagamento |
| CHAOS_ENABLED        | false                   | Habilitar chaos engineering  |

## Rodar localmente (sem Docker para API/Worker)

```bash
# Subir apenas infra (Postgres, Redis, RabbitMQ)
docker compose up -d postgres redis rabbitmq

# Ajustar .env para apontar localhost
export DATABASE_URL=postgresql://app:app@localhost:5433/app
export REDIS_URL=redis://localhost:6380
export RABBITMQ_URL=amqp://guest:guest@localhost:5673

npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npx prisma db seed

# Terminal 1: API
npm run start

# Terminal 2: Worker
npm run start:worker
```

## Comandos de verificação

```bash
npm ci
npm run lint
npm run test
./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh && ./scripts/smoke.sh
```

## Scripts

| Script               | Descrição                          |
|----------------------|------------------------------------|
| `./scripts/up.sh`    | Subir toda infraestrutura via Docker Compose |
| `./scripts/down.sh`  | Derrubar containers e volumes     |
| `./scripts/migrate.sh` | Executar migrations Prisma      |
| `./scripts/seed.sh`  | Carregar dados de teste            |
| `./scripts/smoke.sh` | Smoke tests automatizados          |
| `./scripts/logs.sh` | Logs em tempo real                 |
| `./scripts/api-export.sh` | Exportar OpenAPI spec        |

## Stack

| Componente | Tecnologia      |
|------------|-----------------|
| Runtime    | Node.js 20+     |
| Framework  | NestJS 10 + Fastify |
| ORM        | Prisma 5        |
| Banco      | PostgreSQL 16   |
| Cache      | Redis 7         |
| Queue      | RabbitMQ 3      |
| Auth       | JWT HS256 + Passport |
| Métricas   | prom-client + Prometheus |
| Dashboards | Grafana         |

## Troubleshooting

**RabbitMQ "Connection refused":**
```bash
docker compose ps  # verificar se rabbitmq está healthy
./scripts/down.sh && ./scripts/up.sh
```

**Banco fora de sync:**
```bash
npx prisma generate
./scripts/migrate.sh
./scripts/seed.sh
```

**Worker não processa:**
```bash
./scripts/logs.sh  # verificar logs do worker
# RabbitMQ Admin: http://localhost:15673 → Queues → orders.dlq
```

**Rate limit 429:** Endpoints `/v1/docs`, `/v1/metrics`, `/v1/healthz`, `/v1/readyz` têm bypass. Demais rotas usam token bucket por tenant/sub.

## Licença

MIT
