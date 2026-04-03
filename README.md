# node-b2b-orders

[![CI](https://github.com/ricartefelipe/node-b2b-orders/actions/workflows/ci.yml/badge.svg)](https://github.com/ricartefelipe/node-b2b-orders/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-FF6600?logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

API B2B de **Pedidos** e **Inventário** com NestJS, Fastify, Prisma, PostgreSQL, Redis e RabbitMQ. Implementa **Outbox Pattern**, **worker assíncrono**, **idempotência**, **RBAC/ABAC**, **rate limiting**, **multi-tenancy** e **observabilidade** (Prometheus/Grafana). Integra com **spring-saas-core** (JWT) e **py-payments-ledger** (eventos de pagamento).

---

## Índice

- [Branches e ambientes na nuvem](#branches-e-ambientes-na-nuvem)
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
- [Fastify, npm audit e overrides](#fastify-npm-audit-e-overrides)
- [Troubleshooting](#troubleshooting)
- [E2E com Fluxe B2B Suite](#e2e-com-fluxe-b2b-suite)
- [Licença](#licença)

---

## Branches e ambientes na nuvem

| Branch Git | Deploy Railway | Função |
|------------|----------------|--------|
| **`develop`** | **Staging** | **Teste** — integração, QA, demos; **não** é produção com clientes reais. |
| **`master`** | **Produção** | **Para valer** — dados e operações reais. |

Referência completa: [AMBIENTES-CONFIGURACAO.md](https://github.com/ricartefelipe/fluxe-b2b-suite/blob/develop/docs/AMBIENTES-CONFIGURACAO.md) no repositório **fluxe-b2b-suite**.

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

### Rede Docker compartilhada

Todos os serviços da plataforma Fluxe B2B usam a rede externa `fluxe_shared` para comunicação entre containers. O script `up.sh` cria automaticamente a rede caso ela não exista. Para criar manualmente:

```bash
docker network create fluxe_shared
```

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
| ops@demo.example.com | ops123 | tenant_demo | ops | orders:rw, inventory:rw, products:rw, profile:r |
| sales@demo.example.com | sales123 | tenant_demo | sales | orders:r, inventory:r, products:r, profile:r |

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

Documentação: [docs/contracts/identity.md](docs/contracts/identity.md), [docs/contracts/headers.md](docs/contracts/headers.md).

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

- **`.env`** — copie de `.env.example`; valores padrão são para **Docker** (hostnames `postgres`, `redis`, `rabbitmq`).
- **`.env.local`** — (opcional, gitignored) overrides para rodar a API na sua máquina com infra no Docker. Copie de `.env.local.example` e ajuste se necessário. O app carrega `.env` e depois `.env.local` (este prevalece). Para portas alinhadas ao Fluxe B2B Suite, use o `local.env.example` em `fluxe-b2b-suite/config/env/`.

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

Com infra no Docker (postgres, redis, rabbitmq), use `.env.local` para apontar para localhost (portas dependem do compose; para Fluxe B2B Suite: 5435, 6382, 5675 — ver `fluxe-b2b-suite/config/env/portas-local.md`).

```bash
# Opção A: usar .env.local (recomendado)
cp .env.local.example .env.local

# Opção B: export manual (ajuste portas ao seu compose)
docker compose up -d postgres redis rabbitmq

export DATABASE_URL=postgresql://app:app@localhost:5435/app
export REDIS_URL=redis://localhost:6382
export RABBITMQ_URL=amqp://guest:guest@localhost:5675

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

### Testes E2E locais

Os testes E2E exigem PostgreSQL, Redis e RabbitMQ. Use o `docker-compose.e2e.yml`:

```bash
docker compose -f docker-compose.e2e.yml up -d
npm ci && npm run build
npx prisma generate
DATABASE_URL=postgresql://app:app@localhost:5432/orders_test npx prisma migrate deploy
DATABASE_URL=postgresql://app:app@localhost:5432/orders_test npx prisma db seed

DATABASE_URL=postgresql://app:app@localhost:5432/orders_test \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=e2e-test-secret-key-do-not-use-in-production \
RABBITMQ_URL=amqp://guest:guest@localhost:5672 \
npm run test:e2e
```

Comandos de verificação rápida:

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
3. **Auth:** `POST /v1/auth/token` com `{"email":"ops@demo.example.com","password":"ops123","tenantId":"tenant_demo"}`
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
| Framework | NestJS 11 + Fastify |
| ORM | Prisma 5 |
| Banco | PostgreSQL 16 |
| Cache | Redis 7 |
| Queue | RabbitMQ 3 |
| Auth | JWT HS256 + Passport |
| Métricas | prom-client + Prometheus |
| Dashboards | Grafana |

---

## Fastify, npm audit e overrides

O serviço usa **Fastify 5.8.4** na dependência direta (`package.json`). O pacote **`@nestjs/platform-fastify` (Nest 11)** ainda declara internamente Fastify **5.8.2**, que tinha o aviso [GHSA-444r-cwp2-x5xf](https://github.com/fastify/fastify/security/advisories/GHSA-444r-cwp2-x5xf) (headers `X-Forwarded-*`). Por isso existe um **`overrides.fastify`** fixo em **5.8.4**: o npm passa a resolver uma única versão para toda a árvore e o `npm audit` fica limpo.

**O que fazer no dia a dia:** `npm ci` ou `npm install` como habitualmente; não remover o override até o Nest estável passar a depender de Fastify ≥ 5.8.3. Para validar: `npm audit` (e no CI, `npm audit --audit-level=high`).

**Staging / Railway:** com o serviço apontando à branch `develop`, cada merge em `develop` dispara novo build e deploy no Railway (ver [DEPLOY-RAILWAY](https://github.com/ricartefelipe/fluxe-b2b-suite/blob/develop/docs/DEPLOY-RAILWAY.md) no repositório fluxe-b2b-suite).

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Railway/PostgreSQL partilhado: erro `OutboxEvent` / tabela em falta | Aplicar DDL com **um statement por vez** (limitação Prisma prepared statement); ver `scripts/railway-create-outbox-event-table.cjs` e `railway ssh` + `base64` como no comentário do script. |
| RabbitMQ "Connection refused" | `docker compose ps`; `./scripts/down.sh && ./scripts/up.sh` |
| Banco fora de sync | `npx prisma generate`, `./scripts/migrate.sh`, `./scripts/seed.sh` |
| Worker não processa | `./scripts/logs.sh`; RabbitMQ Admin → Queues → orders.dlq |
| Rate limit 429 | Rotas `/v1/docs`, `/v1/metrics`, `/v1/healthz`, `/v1/readyz` têm bypass; demais usam token bucket por tenant/sub |

---

## Staging — checklist de pedido (curl)

Para repetir em **staging** (ex.: Railway) o fluxo mínimo **auth → POST /v1/orders → RESERVED → CONFIRMED**, use o checklist e o script na **fluxe-b2b-suite**: [`docs/CHECKLIST-PEDIDO-STAGING.md`](https://github.com/ricartefelipe/fluxe-b2b-suite/blob/develop/docs/CHECKLIST-PEDIDO-STAGING.md) (`pnpm smoke:order-staging` com `ORDERS_SMOKE_URL`). Opcional até **PAID**: `pnpm smoke:order-staging:paid` (publica `payment.settled` com `RABBITMQ_URL`) ou `pnpm smoke:order-staging:saga` (saga ledger + workers; só poll HTTP). O smoke HTTP leve pós-deploy continua em `scripts/smoke-post-merge.sh`.

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
