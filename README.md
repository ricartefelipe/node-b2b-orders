# 🚀 node-b2b-orders

[![Node.js](https://img.shields.io/badge/Node.js-20+-4ade80?logo=node.js)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10+-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build](https://img.shields.io/badge/Build-Passing-brightgreen)]()

Referência empresarial completa de uma **API B2B de Pedidos e Inventário** implementada com **NestJS**, **Prisma**, **RabbitMQ** e **PostgreSQL**. Demonstra padrões arquiteturais críticos para sistemas distribuídos em produção: **Outbox Pattern**, **Worker Assíncrono**, **Idempotência**, **RBAC/ABAC**, **Rate Limiting**, **Multi-tenancy** e **Observabilidade completa**.

## ✨ Destaques Técnicos

### 🏗️ Padrões de Confiabilidade
- **🔄 Outbox Pattern**: Transações ACID com garantia de entrega eventual de eventos
- **⚙️ Worker Assíncrono**: Processamento confiável com RabbitMQ e Dead Letter Queue (DLQ)
- **🛡️ Idempotência**: Operações 100% seguras contra retentativas e duplicatas
- **🔗 Transações Distribuídas**: Saga Pattern com rollback automático

### 🔐 Segurança & Autorização
- **🔑 Autenticação JWT**: Tokens stateless HS256 com validação em todas rotas
- **👥 RBAC/ABAC**: Controle fino de acesso baseado em roles e atributos
- **🚫 Rate Limiting**: Proteção contra abuso via Redis com token bucket
- **🏢 Multi-tenancy**: Isolamento 100% de dados, cache e filas por tenant

### 📊 Observabilidade
- **📊 Prometheus**: Coleta automática de métricas de negócio e infraestrutura
- **📈 Grafana**: Dashboards em tempo real para ordens, inventário e worker
- **🔭 OpenTelemetry**: Tracing distribuído de requisições (pronto para extensão)
- **📝 Logs Estruturados**: Pino com contextualização de tenant/correlationId

### ✅ Testes & Qualidade
- **🧪 E2E com Jest**: Cobertura completa de fluxos críticos
- **✅ Smoke Tests**: Validação rápida pré-deploy
- **🎯 Unit Tests**: Testes isolados de lógica de negócio

---

## 🎯 Visão Geral

Este projeto é um **blueprint de produção** que implementa um sistema B2B escalável onde:

1. **Clientes** (tenants) criam pedidos em tempo real
2. **Worker assíncrono** processa eventos de forma confiável (com retry automático)
3. **Inventário** é reservado atomicamente durante confirmação do pedido
4. **Eventos** são persistidos no banco (outbox) e publicados via RabbitMQ
5. **Métricas** são coletadas em tempo real para análise operacional

### Arquitetura em Diagrama

```
┌─────────────────┐
│  Cliente HTTP   │
└────────┬────────┘
         │ JWT + X-Tenant-Id
         ▼
┌──────────────────────────────┐
│  API REST (NestJS + Fastify) │
│  - Controllers               │
│  - Guards (Auth/RBAC/Rate)   │
│  - Validators (class-validator)
└────────┬────────────┬────────┘
         │            │
         │ Write      │ Read/Observability
         ▼            ▼
    ┌──────────┐  ┌──────────┐
    │PostgreSQL│  │  Redis   │
    │(Outbox)  │  │(Cache)   │
    └────┬─────┘  └────┬─────┘
         │ Event Dispatch
         ▼
    ┌─────────────┐
    │  RabbitMQ   │
    │  (Topics)   │
    └─────┬───────┘
          │
    ┌─────▼──────────┐
    │Worker Process  │
    │ - Consume      │
    │ - Process      │
    │ - Persist      │
    └────────────────┘
         │
         ▼
    ┌──────────────────┐
    │Prometheus+Grafana│
    │  (Observability) │
    └──────────────────┘
```

---

## 🚀 Início Rápido

### Pré-requisitos
- Docker & Docker Compose
- Node.js 20+
- Git

### Setup em 5 Passos

```bash
# 1️⃣ Clonar o repositório
git clone https://github.com/seu-usuario/node-b2b-orders.git
cd node-b2b-orders

# 2️⃣ Subir toda infraestrutura
./scripts/up.sh

# 3️⃣ Executar migrações e seed
./scripts/migrate.sh
./scripts/seed.sh

# 4️⃣ Verificar saúde do sistema
./scripts/smoke.sh

# 5️⃣ Pronto! Acesse em http://localhost:3000/docs
```

---

## 📍 URLs & Credenciais de Teste

### Serviços

| Serviço | URL | Usuário | Senha |
|---------|-----|--------|-------|
| 🔵 **Swagger UI** | http://localhost:3000/docs | - | - |
| 🐰 **RabbitMQ** | http://localhost:15672 | guest | guest |
| 📊 **Prometheus** | http://localhost:9090 | - | - |
| 📈 **Grafana** | http://localhost:3001 | admin | admin |
| 🗄️ **PostgreSQL** | localhost:5432 | postgres | postgres |
| 🔴 **Redis** | localhost:6379 | - | - |

### Usuários de Teste

```
👤 Admin Global (acesso total)
   Email: admin@local
   Senha: admin123
   Permissões: todos endpoints
   Tenant: N/A (global)

👤 Operador (tenant_demo)
   Email: ops@demo
   Senha: ops123
   Tenant: tenant_demo
   Permissões: Listar/atualizar pedidos e estoque

👤 Vendedor (tenant_demo)
   Email: sales@demo
   Senha: sales123
   Tenant: tenant_demo
   Permissões: Criar/visualizar pedidos
```

### Exemplo de Requisição (cURL)

```bash
# 1. Autenticar
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"admin123"}' | jq -r '.access_token')

# 2. Criar pedido
curl -X POST http://localhost:3000/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: tenant_demo" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"sku": "PROD-001", "quantity": 5, "unitPrice": 99.90}
    ]
  }'

# 3. Listar pedidos
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: tenant_demo" \
  http://localhost:3000/v1/orders | jq .
```

---

## 📚 Documentação

### 📖 Guias Principais

- **[GOLDEN_PATH.md](./docs/GOLDEN_PATH.md)** - Como adicionar novo endpoint COM observabilidade & segurança embutidas
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Guia de contribuição e código style
- **[SECURITY.md](./SECURITY.md)** - Políticas de segurança e divulgação de vulnerabilidades
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Deploy em produção (Railway, DigitalOcean, AWS)

### 📋 Documentação Técnica

- **API OpenAPI**: Servida via Swagger em `/docs`
- **Exportar OpenAPI**: `./scripts/api-export.sh` → gera `docs/api/openapi.{json,yaml}`
- **Exemplos de Requisições**: Veja `docs/api/examples.md`
- **Fluxo Principal**: `docs/architecture/sequence-main-flow.mmd`
- **Modelo de Dados**: `docs/architecture/erd.mmd`

---

## 🏗️ Arquitetura em Detalhe

### Fluxo Principal: Criar Pedido

```typescript
// 1. POST /v1/orders (API)
const order = await prisma.order.create({
  data: { tenantId, status: 'PENDING', items: [...] }
});

// 2. Persistir evento no Outbox (mesma transação)
await prisma.outboxEvent.create({
  data: { event: 'order.created', payload: order }
});

// 3. Worker dispara a cada 5s
const events = await prisma.outboxEvent.findMany({
  where: { status: 'PENDING' }
});

// 4. Publicar no RabbitMQ
await channel.publish(exchange, 'tenant_demo.order.created', buffer);

// 5. Worker consome evento
await processOrderCreated(order);
  ├─ Verificar inventário
  ├─ [SIM] Reservar stock → Update Order status
  │         Publicar 'stock.reserved'
  └─ [NÃO] Cancelar order → Publicar 'order.cancelled'

// 6. Retry automático com backoff exponencial
// 1s → 2s → 4s → 8s → 16s → 32s → 60s → DLQ
```

### Isolamento de Tenant

**Todos** os dados, caches e filas são isolados por tenant:

```typescript
// ✅ Dados sempre filtrados por tenant
const orders = await prisma.order.findMany({
  where: { tenantId: context.tenantId }
});

// ✅ Cache isolado
const cacheKey = `inventory:${tenantId}:${sku}`;
const cached = await redis.get(cacheKey);

// ✅ Topics RabbitMQ por tenant
const routingKey = `${tenantId}.order.created`;
channel.publish(exchange, routingKey, buffer);
```

### Idempotência & Retry

Operações safe contra retentativas com `Idempotency-Key`:

```bash
curl -X POST http://localhost:3000/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: order-uuid-123" \
  -d '...'

# Mesma requisição 2x = Mesma resposta
# Worker retry automático: 1s → 2s → 4s ... (max 60s)
```

---

## 💻 Desenvolvim Local

### Comandos Úteis

```bash
# Ver logs em tempo real
./scripts/logs.sh

# Executar migrações
./scripts/migrate.sh

# Carregar dados de teste
./scripts/seed.sh

# Rodar smoke tests
./scripts/smoke.sh

# Parar containers
./scripts/down.sh

# Reiniciar tudo
./scripts/down.sh && ./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh
```

### Testes

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Com coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Build
npm run build
```

---

## 📊 Observabilidade

### Métricas Prometheus

Disponíveis em `http://localhost:9090`

```
# Business metrics
orders_created_total{tenant_id="tenant_demo"}
orders_confirmed_total{tenant_id="tenant_demo"}
orders_cancelled_total{tenant_id="tenant_demo"}
inventory_reserved_total{tenant_id="tenant_demo"}

# API metrics
http_requests_total{method="POST", path="/orders", status="201"}
http_request_duration_seconds_bucket{path="/orders", le="1"}
rate_limit_exceeded_total{tenant_id="tenant_demo"}

# Worker metrics
worker_processed_total{queue="orders", success="true"}
worker_retry_total{queue="orders", attempt="2"}
outbox_events_pending{tenant_id="tenant_demo"}
```

### Dashboards Grafana

Acesse em `http://localhost:3001` (admin/admin)

- **overview.json**: RPS, latência, taxa de erro, uptime
- **orders.json**: Volume de pedidos por status, cancelamentos
- **inventory.json**: Reservas, estoque, alertas de falta
- **worker.json**: Lag de fila, reprocessamento, DLQ

---

## 🛠️ Stack Tecnológico

| Camada | Tecnologia | Versão | Motivo |
|--------|-----------|--------|--------|
| **Runtime** | Node.js | 20+ | LTS, performance nativa |
| **Linguagem** | TypeScript | 5.3+ | Segurança de tipos, maintainability |
| **Framework** | NestJS | 10+ | Arquitetura escalável, DI nativa |
| **Server** | Fastify | 4.26+ | Performance (2x mais rápido que Express) |
| **ORM** | Prisma | 5.10+ | Type-safe, migrations automáticas |
| **Banco** | PostgreSQL | 15+ | ACID, JSON, extensível |
| **Cache** | Redis | 7+ | Rate limiting, cache distribuído |
| **Queue** | RabbitMQ | 3.13+ | Mensagens confiáveis, DLQ nativa |
| **Auth** | JWT HS256 | - | Stateless, simples |
| **Testes** | Jest | 29+ | Rápido, snapshots, coverage |
| **Observabilidade** | Prometheus+Grafana | - | Standard industry, open-source |

---

## 🎓 Aprendizados (Golden Path)

Este projeto serve como **exercício educativo completo**. Explore:

1. **Começar simples**: Leia `docs/GOLDEN_PATH.md`
2. **Adicionar seu endpoint**: Siga o template (DTO → Service → Controller)
3. **Integrar observabilidade**: Adicione métricas Prometheus
4. **Escrever testes**: Unit + E2E com Jest
5. **Deploy em produção**: Leia `docs/DEPLOYMENT.md`

### Conceitos Implementados

- ✅ Clean Architecture (camadas separadas)
- ✅ CQRS leve (read/write patterns)
- ✅ Saga Pattern (transações distribuídas)
- ✅ Outbox Pattern (garantia de entrega)
- ✅ Retry com backoff exponencial
- ✅ Circuit breaker (via Opossum)
- ✅ Validação de input (class-validator)
- ✅ Rate limiting distribuído
- ✅ Contextualização (tenant, correlation ID)

---

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para:
- Process de contribuição
- Code style & linting
- Guidelines de testes
- Como adicionar um novo endpoint

---

## 📄 Licença

MIT - Veja [LICENSE](./LICENSE) para detalhes.

---

## 📞 Suporte

- **Issues**: https://github.com/seu-usuario/node-b2b-orders/issues
- **Discussions**: https://github.com/seu-usuario/node-b2b-orders/discussions
- **Email**: dev@seu-dominio.com

---

## 🙏 Agradecimentos

Construído com inspiração em padrões de arquitetura distribuída, blog posts da comunidade NestJS e melhores práticas de produção.

---

**Pronto para usar em produção? Veja [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** 🚀
const backoffSeconds = Math.min(60, 2 ** Math.min(6, attempts));
const availableAt = new Date(Date.now() + backoffSeconds * 1000);
```

## 📊 Observabilidade

### Métricas Coletadas

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `orders_total` | Counter | Total de pedidos criados |
| `orders_duration_ms` | Histogram | Latência de operação |
| `inventory_reserved_units` | Gauge | Unidades em reserva |
| `worker_messages_processed` | Counter | Eventos processados |
| `worker_dead_letter_total` | Counter | Mensagens em DLQ |
| `auth_failures_total` | Counter | Tentativas de autenticação falhadas |

### Dashboard Grafana

- **Overview**: RPS, latência p95, taxa de erro
- **Pedidos**: Distribuição por status, tempo médio
- **Inventário**: Stock por SKU, reservas ativas
- **Worker**: Taxa de processamento, dead letters

## 🛠️ Desenvolvimento

### Comandos Úteis

```bash
# Build
npm run build

# Desenvolvimento (watch mode)
npm run start

# Worker em background
npm run start:worker

# Testes
npm test

# E2E
npm run test:e2e

# Lint & Format
npm run lint
npm run format

# Exportar OpenAPI (JSON/YAML)
npm run api:export

# Recriar banco do zero
./scripts/migrate.sh && ./scripts/seed.sh

# Ver logs em tempo real
./scripts/logs.sh

# Parar tudo
./scripts/down.sh
```

### Variáveis de Ambiente

Crie `.env` na raiz:

```env
# API
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/b2b_orders

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# JWT
JWT_SECRET=seu-super-secret-123
JWT_EXPIRES_IN=24h

# Observabilidade
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
```

## 📦 Stack Tecnológico

### Backend
- **NestJS 10**: Framework TypeScript de alto desempenho
- **Prisma 5**: ORM type-safe com migrações automáticas
- **Fastify**: Servidor HTTP ultra-rápido

### Dados
- **PostgreSQL 15**: Banco relacional com ACID
- **Redis 7**: Cache e rate limiting
- **RabbitMQ 3.13**: Message broker confiável

### Observabilidade
- **Prometheus**: Coleta de métricas
- **Grafana**: Visualização de dados
- **OpenTelemetry**: Tracing distribuído
- **Pino**: Logger estruturado

### Testes
- **Jest 29**: Framework de testes rápido
- **Supertest**: HTTP assertions
- **ts-jest**: Suporte TypeScript

## 🔒 Segurança

### Implementado

- ✅ **Autenticação JWT**: Todos os endpoints protegidos
- ✅ **ABAC Guards**: Validação de atributos customizados
- ✅ **Rate Limiting**: Proteção DDoS via Redis
- ✅ **Tenant Isolation**: Queries sempre filtradas
- ✅ **Password Hashing**: Bcrypt com salt 10
- ✅ **CORS**: Configurado por ambiente
- ✅ **Helmet**: Headers de segurança HTTP

### Não Implementado (Por Escopo)
- ⏳ OAuth 2.0 / OIDC
- ⏳ mTLS entre serviços
- ⏳ Criptografia end-to-end de dados

## 🧪 Testes

### Estrutura

```
test/
├── e2e/
│   ├── auth.spec.ts
│   ├── orders.spec.ts
│   └── inventory.spec.ts
└── unit/
    ├── auth.spec.ts
    └── orders.service.spec.ts
```

### Executar

```bash
# Todos os testes
npm test

# Apenas E2E
npm run test:e2e

# Com cobertura
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Exemplo de Teste E2E

```typescript
describe('Orders (e2e)', () => {
  it('should create order and process async', async () => {
    const token = await login('sales@demo', 'sales123');

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenantId: 'tenant_demo',
        items: [{ sku: 'PROD-001', qty: 5 }]
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('PENDING');

    // Aguardar processamento async
    await sleep(2000);

    const order = await prisma.order.findUnique({
      where: { id: res.body.id }
    });
    expect(order.status).toBe('RESERVED');
  });
});
```

## 🚨 Troubleshooting

### "Connection refused" no RabbitMQ
```bash
docker ps | grep rabbitmq
./scripts/down.sh && ./scripts/up.sh
```

### Banco de dados fora de sync
```bash
npm run prisma:generate
./scripts/migrate.sh
./scripts/seed.sh
```

### Worker não processa mensagens
```bash
# Ver logs do worker
./scripts/logs.sh worker

# Verificar DLQ no RabbitMQ Admin
# http://localhost:15672 → Queues → orders.dlq
```

### Taxa alta de erro 401
```bash
# Verificar JWT_SECRET em .env
# Confirmar token não expirou (JWT_EXPIRES_IN)
# Validar tenant do usuário no banco
```

## 📖 Documentação Adicional

- **API OpenAPI**: Swagger em `/docs` com todos os endpoints
- **Diagramas**: UML, C4 e sequência em `docs/architecture/`
- **Exemplos**: cURL, Postman, Insomnia em `docs/api/`

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/minha-feature`)
3. Commit changes (`git commit -am 'Add feature'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

## 📝 Licença

Código aberto para fins educacionais e comerciais.

## 🎯 Próximos Passos

- [ ] Suporte a PostgreSQL Replication
- [ ] OAuth 2.0 / OIDC Provider
- [ ] Kafka como alternativa ao RabbitMQ
- [ ] GraphQL API
- [ ] Mobile SDK
- [ ] Webhooks customizados

---

**Desenvolvido com ❤️ em TypeScript**
