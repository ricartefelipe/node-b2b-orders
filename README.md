# 🚀 node-b2b-orders

Referência empresarial completa de uma **API B2B de Pedidos e Inventário** implementada com **NestJS**, **Prisma**, **RabbitMQ** e **PostgreSQL**. Demonstra padrões arquiteturais críticos para sistemas distribuídos em produção: **Outbox Pattern**, **Worker Assíncrono**, **Idempotência**, **RBAC/ABAC**, **Rate Limiting**, **Multi-tenancy** e **Observabilidade completa**.

## ✨ Destaques Técnicos

### Padrões de Confiabilidade
- **🔄 Outbox Pattern**: Transações ACID com garantia de entrega eventual de eventos
- **⚙️ Worker Assíncrono**: Processamento confiável com RabbitMQ e Dead Letter Queue (DLQ)
- **🛡️ Idempotência**: Operações 100% seguras contra retentativas e duplicatas
- **🔐 Transações Distribuídas**: Saga Pattern com rollback automático

### Segurança & Autorização
- **🔑 Autenticação JWT**: Tokens stateless com validação em todas as rotas
- **👥 RBAC/ABAC**: Controle fino de acesso baseado em roles e atributos
- **🚫 Rate Limiting**: Proteção contra abuso via Redis com bucket de tokens
- **🏢 Multi-tenancy**: Isolamento 100% de dados, cache e permissões por tenant

### Observabilidade
- **📊 Prometheus**: Coleta automática de métricas de negócio e infraestrutura
- **📈 Grafana**: Dashboards em tempo real para ordens, inventário e worker
- **🔭 OpenTelemetry**: Tracing distribuído de requisições
- **📝 Logs Estruturados**: Pino com contextualização de tenant/correlationId

### Testes & Qualidade
- **🧪 E2E com Jest**: Cobertura completa de fluxos críticos
- **✅ Smoke Tests**: Validação rápida pré-deploy
- **🎯 Unit Tests**: Testes isolados de lógica de negócio

## 📋 Visão Geral

Este projeto é um **blueprint de produção** que implementa um sistema B2B escalável onde:

1. **Clientes** (tenants) gerenciam **pedidos** em tempo real
2. **Worker assíncrono** processa eventos de forma confiável (com retry automático)
3. **Inventário** é reservado atomicamente durante confirmação do pedido
4. **Eventos** são persistidos no banco (outbox) e publicados via RabbitMQ
5. **Métricas** são coletadas em tempo real para análise operacional

```
┌─────────────┐     ┌──────────┐     ┌────────────┐
│  API REST   │────▶│PostgreSQL│◀────│   Redis    │
│ (NestJS)    │     │(Outbox)  │     │(Rate Limit)│
└─────────────┘     └──────────┘     └────────────┘
       │                  │
       │            ┌──────┴──────┐
       │            │             │
       ▼            ▼             ▼
   ┌────────┐  ┌─────────┐  ┌──────────┐
   │ RabbitMQ  │Worker   │  │Prometheus│
   │(Topics)   │(Consume)│  │+Grafana  │
   └────────┘  └─────────┘  └──────────┘
```

## 🚀 Início Rápido

### Pré-requisitos
- Docker & Docker Compose
- Node.js 18+
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

# 5️⃣ Pronto! Acesse a API em http://localhost:3000/docs
```

## 📍 Endpoints & Credenciais

### URLs de Serviços

| Serviço | URL | Propósito |
|---------|-----|----------|
| 🔵 **API (Swagger)** | http://localhost:3000/docs | Documentação interativa |
| 🐰 **RabbitMQ** | http://localhost:15672 | Gerenciamento de filas |
| 📊 **Prometheus** | http://localhost:9090 | Métricas brutos |
| 📈 **Grafana** | http://localhost:3001 | Dashboards visuais |
| 🗄️ **PostgreSQL** | localhost:5432 | Banco de dados principal |
| 🔴 **Redis** | localhost:6379 | Cache e rate limiting |

### Credenciais de Teste

```
👤 Admin Global
   Email: admin@local
   Senha: admin123
   Permissões: Acesso total aos endpoints

👤 Operador Tenant Demo
   Email: ops@demo
   Senha: ops123
   Tenant: tenant_demo
   Permissões: Listar/atualizar pedidos

👤 Vendedor Tenant Demo
   Email: sales@demo
   Senha: sales123
   Tenant: tenant_demo
   Permissões: Criar/visualizar pedidos
```

### Exemplo de Requisição (cURL)

```bash
# 1. Autenticar
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"admin123"}' | jq -r '.accessToken')

# 2. Criar pedido
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_demo",
    "items": [
      {"sku": "PROD-001", "qty": 5, "unitPrice": 99.90}
    ]
  }'

# 3. Listar pedidos
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/orders?tenantId=tenant_demo | jq .
```

## 🏗️ Arquitetura Detalhada

### Fluxo Principal: Criar Pedido

```
1. POST /orders
   ├─ Validar JWT e tenant
   ├─ Criar Order (status: PENDING)
   ├─ Registrar no Outbox: 'order.created'
   └─ Retornar 201 + orderId

2. Worker consume: order.created
   ├─ Carregar Order + Items
   ├─ Verificar disponibilidade em Inventory
   ├─ [SIM] Reservar stock + Update Order (RESERVED)
   │  └─ Publicar: 'stock.reserved'
   └─ [NÃO] Cancelar Order + Publicar: 'order.cancelled'

3. API consome: stock.reserved
   ├─ Notificar cliente (webhook/push)
   └─ Atualizar dashboard em tempo real (WebSocket)

4. Cliente confirma: PATCH /orders/{id}/confirm
   ├─ Liberar stock reservado
   ├─ Update Order (CONFIRMED)
   └─ Publicar: 'order.confirmed' → fulfill/ship
```

### Isolamento de Tenant

**Todos** os dados, caches e filas RabbitMQ são isolados por tenant:

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

O worker implementa **backoff exponencial** com cap de 60 segundos:

- **Tentativa 1**: Imediata
- **Tentativa 2**: 2s
- **Tentativa 3**: 4s
- **Tentativa 4**: 8s
- **Tentativa 5**: 16s
- **Tentativa 6**: 32s
- **Tentativa 7+**: 60s → Move para **DEAD_LETTER_QUEUE**

```typescript
const attempts = ev.attempts + 1;
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
