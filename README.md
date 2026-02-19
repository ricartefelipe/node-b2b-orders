# 🚀 node-b2b-orders

Demonstração completa de uma **API B2B de Pedidos e Inventário** com NestJS + Prisma, implementando padrões empresariais como **outbox**, **worker assíncrono**, **idempotência**, **RBAC/ABAC**, **rate limit com Redis**, **observabilidade** com Prometheus/Grafana e **multi-tenancy**.

## ✨ Destaques Técnicos

- **Outbox Pattern**: Garante consistência eventual através de events persistidos
- **Worker Assíncrono**: Processamento de tarefas em background com RabbitMQ
- **Idempotência**: Operações seguras contra retentativas
- **Autenticação JWT**: Com estratégias customizadas
- **RBAC/ABAC**: Controle de acesso baseado em papéis e atributos
- **Rate Limiting**: Proteção contra abuso via Redis
- **Multi-tenancy**: Isolamento completo de dados por tenant
- **Observabilidade**: Prometheus + Grafana + OpenTelemetry
- **Testes E2E**: Cobertura completa com Jest

## 🚀 Início Rápido

```bash
# 1. Configurar variáveis de ambiente
cp .env.example .env

# 2. Subir infraestrutura (Docker)
./scripts/up.sh

# 3. Executar migrações
./scripts/migrate.sh

# 4. Carregar dados de teste
./scripts/seed.sh

# 5. Executar testes smoke
./scripts/smoke.sh
```

## 📍 URLs de Acesso

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **API Docs** (Swagger) | http://localhost:3000/docs | - |
| **RabbitMQ** | http://localhost:15673 | guest/guest |
| **Prometheus** | http://localhost:9091 | - |
| **Grafana** | http://localhost:3001 | admin/admin |

## 👤 Credenciais de Teste

| Papel | Email | Senha | Tenant |
|-------|-------|-------|--------|
| Admin Global | `admin@local` | `admin123` | - |
| Operações | `ops@demo` | `ops123` | tenant_demo |
| Vendas | `sales@demo` | `sales123` | tenant_demo |

## 📚 Documentação

- **API OpenAPI**: Servida via Swagger em `/docs`
- **Exportar OpenAPI**: `./scripts/api-export.sh` → gera `docs/api/openapi.{json,yaml}`
- **Exemplos de Requisições**: Veja `docs/api/examples.md`
- **Decisões Arquiteturais**: `docs/architecture/decisions.md`
- **Fluxo Principal**: `docs/architecture/sequence-main-flow.mmd`
- **Modelo de Dados**: `docs/architecture/erd.mmd`

## 🏗️ Arquitetura

Este repositório demonstra **correctness sob constraints produtivos**:

- ✅ Isolamento de tenant
- ✅ Operações idempotentes
- ✅ Consistência eventual via outbox/worker
- ✅ Autorização orientada por políticas (ABAC)
- ✅ Observabilidade e monitoramento
- ✅ Tratamento de erros resiliente

## 📦 Stack Tecnológico

- **Framework**: NestJS
- **Banco de Dados**: PostgreSQL com Prisma ORM
- **Cache/Rate Limit**: Redis
- **Message Queue**: RabbitMQ
- **Observabilidade**: Prometheus + Grafana + OpenTelemetry
- **Testes**: Jest
- **Containerização**: Docker Compose

## 🛠️ Desenvolvimento Local

```bash
# Ver logs em tempo real
./scripts/logs.sh

# Parar containers
./scripts/down.sh

# Recriar banco com seed
./scripts/migrate.sh && ./scripts/seed.sh
```

## 📊 Monitoramento

- **Métricas**: Prometheus em http://localhost:9091
- **Dashboards**: Grafana em http://localhost:3001
- **Logs**: Acesse via `./scripts/logs.sh`

## 📖 Runbooks

- **Setup Local**: `docs/runbooks/local-dev.md`
- **Operações**: `docs/runbooks/operations.md`
- **Troubleshooting**: `docs/runbooks/troubleshooting.md`
