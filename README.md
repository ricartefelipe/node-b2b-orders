# node-b2b-orders

[![Node 20+](https://img.shields.io/badge/Node-20+-339933.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E.svg)](https://nestjs.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

API B2B de **Pedidos** e **Inventário** com NestJS, Fastify, Prisma, PostgreSQL, Redis e RabbitMQ. Implementa **Outbox Pattern**, **worker assíncrono**, **idempotência**, **RBAC/ABAC**, **rate limiting**, **multi-tenancy** e **observabilidade** (Prometheus/Grafana). Integra com **spring-saas-core** (JWT) e **py-payments-ledger** (eventos de pagamento).

---

## Índice

- [Visão geral](#visão-geral)
- [Quando usar](#quando-usar)
- [Arquitetura](#arquitetura)
- [Quick Start](#quick-start)
- [URLs e credenciais](#urls-e-credenciais)
- [Endpoints](#endpoints)
- [Eventos RabbitMQ](#eventos-rabbitmq)
- [Auth e headers](#auth-e-headers)
- [Fluxo do pedido](#fluxo-do-pedido)
- [Métricas de negócio](#métricas-de-negócio)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Rodar sem Docker (API + Worker)](#rodar-localmente-sem-docker-para-apiworker)
- [Scripts e verificação](#scripts-e-comandos-de-verificação)
- [Stack](#stack)
- [Troubleshooting](#troubleshooting)
- [E2E com Fluxe B2B Suite](#e2e-com-fluxe-b2b-suite)
- [Licença](#licença)

---

## Visão geral

O **node-b2b-orders** expõe uma API REST para criação e gestão de **pedidos** e **inventário** em um contexto B2B multi-tenant. Cada pedido passa por estados (CREATED → RESERVED → CONFIRMED → PAID) com reserva de estoque e integração opcional com um motor de pagamentos (py-payments-ledger) via RabbitMQ.

**Principais capacidades:**

- **Pedidos**: criação idempotente, confirmação, cancelamento; listagem com filtros.
- **Inventário**: listagem, ajustes (IN/OUT/ADJUSTMENT) com idempotência.
- **Outbox**: eventos `order.created`, `order.confirmed` etc. persistidos e publicados por um worker.
- **Worker**: processa outbox, reserva estoque, publica `payment.charge_requested` e consome `payment.settled`.
- **Auth**: JWT validado (mesmo secret/issuer do spring-saas-core em E2E), guards de tenant e permissões.

---

## Quando usar

- Você precisa de uma **API de pedidos e inventário** para uma suíte B2B (ex.: fluxe-b2b-suite).
- Quer **idempotência** em criação de pedidos e confirmação (header `Idempotency-Key`).
- Deseja **eventos assíncronos** (RabbitMQ) para integrar com pagamentos ou outros serviços.
- O frontend ou o core (spring-saas-core) já emitem JWT; esta API apenas **valida** e aplica ABAC.

---

## Arquitetura

```
Cliente HTTP
   │ JWT + X-Tenant-Id + X-Correlation-Id
   ▼
┌──────────────────────────────┐
│  API REST (NestJS + Fastify) │
│  Guards: JWT → Tenant →       │
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

---

## Quick Start

### Pré-requisitos

- **Docker** e **Docker Compose**
- **Node.js 20+** (para rodar API/Worker fora do Docker)

### Setup completo (um comando)

```bash
git clone https://github.com/ricartefelipe/node-b2b-orders.git
cd node-b2b-orders

./scripts/up.sh
./scripts/migrate.sh
./scripts/seed.sh
./scripts/smoke.sh
```

Isso sobe infraestrutura, API, worker, aplica migrações, seed e executa smoke tests (order → reserved → confirmed).

---

## URLs e credenciais

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| Swagger UI | http://localhost:3000/docs | — |
| RabbitMQ | http://localhost:15673 | guest/guest |
| Prometheus | http://localhost:9091 | — |
| Grafana | http://localhost:3001 | admin/admin |
| PostgreSQL | localhost:5433 | app/app |
| Redis | localhost:6380 | — |

### Usuários de teste

| Email | Senha | Tenant | Role | Permissões |
|-------|-------|--------|------|------------|
| admin@local | admin123 | * (global) | admin | Todas |
| ops@demo | ops123 | tenant_demo | ops | orders:rw, inventory:rw, profile:r |
| sales@demo | sales123 | tenant_demo | sales | orders:r, inventory:r, profile:r |

---

## Endpoints

### Auth

- `POST /v1/auth/token` — Emitir JWT (email, password, tenantId).
- `GET /v1/me` — Dados do usuário autenticado.

### Orders

- `POST /v1/orders` — Criar pedido (**requer Idempotency-Key**).
- `POST /v1/orders/:id/confirm` — Confirmar pedido reservado (**requer Idempotency-Key**).
- `POST /v1/orders/:id/cancel` — Cancelar pedido.
- `GET /v1/orders/:id` — Detalhe do pedido.
- `GET /v1/orders` — Listar pedidos (`?status=`).

### Inventory

- `GET /v1/inventory` — Listar estoque (`?sku=`).
- `POST /v1/inventory/adjustments` — Criar ajuste (IN/OUT/ADJUSTMENT) (**requer Idempotency-Key**).
- `GET /v1/inventory/adjustments` — Listar ajustes (`?sku=`).

### Admin

- `GET /v1/admin/chaos` — Config de chaos engineering.
- `PUT /v1/admin/chaos` — Atualizar chaos config.

### Observabilidade

- `GET /v1/metrics` — Métricas Prometheus.
- `GET /v1/healthz` — Health check.
- `GET /v1/readyz` — Readiness (DB + Redis).

---

## Eventos RabbitMQ

| Evento | Exchange | Origem | Consumidor |
|--------|----------|--------|------------|
| order.created | orders.x | API (outbox) | Worker |
| order.confirmed | orders.x | API (outbox) | Worker |
| order.cancelled | orders.x | API/Worker | Worker |
| payment.charge_requested | payments.x | Worker (outbox) | py-payments-ledger |
| payment.settled | payments.x | py-payments-ledger | Worker |

Contratos detalhados em [docs/contracts/events.md](docs/contracts/events.md).

---

## Auth e headers

- **Obrigatórios:** `Authorization: Bearer <JWT>`, `X-Tenant-Id`.
- **Opcionais:** `X-Correlation-Id` (gerado se ausente).
- **Idempotency-Key:** Obrigatório em `POST /v1/orders`, `POST /v1/orders/:id/confirm`, `POST /v1/inventory/adjustments`.

Documentação: [docs/contracts/identity.md](docs/contracts/identity.md), [docs/contracts/headers.md](docs/contracts/headers.md). [Prompt de evolução](docs/PROMPT-EVOLUCAO.md): objetivo entregável/vendável e IA/LLM. [Prompt de conclusão e vistoria](docs/PROMPT-CONCLUSAO-VISTORIA.md): critérios de qualidade, etapas finais e prontidão IA/LLM.

---

## Fluxo do pedido

```
CREATED → (worker reserva estoque) → RESERVED → (confirm) → CONFIRMED → (payment.settled) → PAID
                                    → (cancel)  → CANCELLED
         → (sem estoque)           → CANCELLED
```

1. `POST /v1/orders` cria pedido CREATED e evento outbox `order.created`.
2. Worker consome `order.created`: reserva estoque ou cancela se insuficiente.
3. `POST /v1/orders/:id/confirm` muda para CONFIRMED e gera `order.confirmed`.
4. Worker consome `order.confirmed`: libera reserva e cria outbox `payment.charge_requested`.
5. Outbox dispatcher publica `payment.charge_requested` no exchange `payments.x`.
6. py-payments-ledger processa e publica `payment.settled`.
7. Worker consome `payment.settled` e atualiza pedido para PAID.

---

## Métricas de negócio

Em `/v1/metrics` (Prometheus):

```
orders_created_total{tenant_id="tenant_demo"}
orders_confirmed_total{tenant_id="tenant_demo"}
orders_cancelled_total{tenant_id="tenant_demo"}
inventory_reserved_total{tenant_id="tenant_demo"}
inventory_adjusted_total{tenant_id="tenant_demo",type="IN"}
```

---

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| HTTP_PORT | 3000 | Porta da API |
| DATABASE_URL | — | Connection string PostgreSQL |
| REDIS_URL | redis://localhost:6379 | Redis |
| RABBITMQ_URL | amqp://guest:guest@localhost:5672 | RabbitMQ |
| JWT_SECRET | change-me | Secret JWT HS256 |
| JWT_ISSUER | local-auth | Issuer do token |
| TOKEN_EXPIRES_SECONDS | 3600 | TTL do token |
| RATE_LIMIT_WRITE_PER_MIN | 60 | Limite escrita/min |
| RATE_LIMIT_READ_PER_MIN | 240 | Limite leitura/min |
| ORDERS_EXCHANGE | orders.x | Exchange de pedidos |
| PAYMENTS_EXCHANGE | payments.x | Exchange de pagamentos |
| PAYMENTS_INBOUND_QUEUE | orders.payments | Fila de eventos de pagamento |
| CHAOS_ENABLED | false | Chaos engineering |

---

## Rodar localmente (sem Docker para API/Worker)

```bash
docker compose up -d postgres redis rabbitmq

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

---

## Scripts e comandos de verificação

| Script | Descrição |
|--------|-----------|
| `./scripts/up.sh` | Sobe toda a stack via Docker Compose |
| `./scripts/down.sh` | Derrubar containers e volumes |
| `./scripts/migrate.sh` | Executar migrações Prisma |
| `./scripts/seed.sh` | Carregar dados de teste |
| `./scripts/smoke.sh` | Smoke tests automatizados |
| `./scripts/logs.sh` | Logs em tempo real |
| `./scripts/api-export.sh` | Exportar OpenAPI spec |

```bash
npm ci
npm run lint
npm run test
./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh && ./scripts/smoke.sh
```

---

## Demo em 3–5 minutos

1. **Subir:** `./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh`
2. **Swagger:** http://localhost:3000/docs
3. **Auth:** `POST /v1/auth/token` com `{"email":"ops@demo","password":"ops123","tenantId":"tenant_demo"}`
4. **Criar pedido:** `POST /v1/orders` com `Idempotency-Key: demo-$(date +%s)` e body `{"customerId":"CUST-1","items":[{"sku":"SKU-1","qty":2,"price":10.5}]}`
5. **Aguardar worker:** ~2–3s; `GET /v1/orders/{id}` — status CREATED → RESERVED
6. **Confirmar:** `POST /v1/orders/{id}/confirm` com `Idempotency-Key: demo-confirm-$(date +%s)`
7. **Fluxo payments:** Worker publica `payment.charge_requested`; py-payments-ledger (se rodando) publica `payment.settled`; worker atualiza para PAID.

Validação completa: `./scripts/smoke.sh`

---

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 + Fastify |
| ORM | Prisma 5 |
| Banco | PostgreSQL 16 |
| Cache | Redis 7 |
| Queue | RabbitMQ 3 |
| Auth | JWT HS256 + Passport |
| Métricas | prom-client + Prometheus |
| Dashboards | Grafana |

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| RabbitMQ "Connection refused" | `docker compose ps`; `./scripts/down.sh && ./scripts/up.sh` |
| Banco fora de sync | `npx prisma generate`, `./scripts/migrate.sh`, `./scripts/seed.sh` |
| Worker não processa | `./scripts/logs.sh`; RabbitMQ Admin → Queues → orders.dlq |
| Rate limit 429 | Rotas `/v1/docs`, `/v1/metrics`, `/v1/healthz`, `/v1/readyz` têm bypass; demais usam token bucket por tenant/sub |

---

## E2E com Fluxe B2B Suite

Para integração com fluxe-b2b-suite e spring-saas-core, o login é feito no Core; esta API **valida** o JWT. Use o mesmo secret e issuer do Spring:

```bash
JWT_SECRET=local-dev-secret-min-32-chars-for-hs256-signing
JWT_ISSUER=spring-saas-core
```

O frontend obtém o token em `POST {coreApiBaseUrl}/v1/dev/token`. Use o mesmo `RABBITMQ_URL` que o py-payments-ledger para o fluxo ordem → pagamento.

---

## Licença

MIT — ver [LICENSE](LICENSE).
