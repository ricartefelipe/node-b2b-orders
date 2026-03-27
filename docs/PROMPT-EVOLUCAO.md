# Prompt de Evolução — node-b2b-orders

Este documento define o **prompt de evolução** do projeto. Use-o como contexto em decisões de arquitetura, backlog e evolução contínua.

---

## Identidade

- **node-b2b-orders** = API B2B de Pedidos e Inventário da plataforma Fluxe.
- Gerencia: pedidos (criação, confirmação, cancelamento), inventário (reservas, ajustes), saga distribuída com pagamentos, outbox (RabbitMQ).
- Consome JWT emitido pelo **spring-saas-core** e aplica ABAC/RBAC localmente; integra-se com **py-payments-ledger** via eventos.

---

## Objetivo: entregável e vendável

Priorizar evolução que aproxime o projeto destes critérios:

| Área | Critério de "pronto para venda" |
|------|----------------------------------|
| **Funcional** | CRUD pedidos/inventário; saga pedido→pagamento→conclusão; idempotência; outbox confiável; auditoria consultável. |
| **Segurança** | ABAC/RBAC com DENY precedente, default-deny; JWT validado via spring-saas-core; auditoria de ACCESS_DENIED; sem credenciais em código. |
| **Operacional** | Health, Prometheus, OpenAPI, scripts up/migrate/seed/smoke, deploy reproduzível, circuit breaker, chaos engineering. |
| **Contratos** | Documentação de identidade/headers/eventos alinhada com saas-core e payments; API v1 estável. |
| **Compliance** | Auditoria de ações sensíveis e negações; retenção/exportação de audit log. |

Preservar sempre: multi-tenancy, ABAC, integração com Fluxe B2B Suite + saas-core + payments.

---

## Critérios detalhados

### Funcional

- CRUD completo de pedidos com ciclo de vida (created → confirmed → paid → shipped → delivered / cancelled)
- CRUD de inventário com reservas atômicas (transação + outbox)
- Saga distribuída: pedido → charge_requested → payment.settled → pedido pago
- Idempotência via header `Idempotency-Key` com cache Redis
- Outbox confiável para eventos de domínio (Prisma transaction + worker RabbitMQ)
- Auditoria consultável via `GET /v1/audit` com filtros e exportação

### Segurança

- ABAC com regra DENY precedente e default-deny (AbacGuard + Policy no Prisma)
- RBAC via PermissionsGuard
- JWT validado (claims: sub, tid, roles, perms, plan, region, iss, exp)
- Auditoria de todas as tentativas ACCESS_DENIED
- Sem credenciais hardcoded em código

### Operacional

- Health checks: `/v1/healthz`, `/v1/readyz` (DB + Redis)
- Métricas Prometheus (`/v1/metrics`)
- OpenAPI (YAML + JSON + Swagger UI em `/docs`)
- Scripts: `up.sh`, `migrate.sh`, `seed.sh`, `smoke.sh`
- Docker multi-stage (api + worker)
- Circuit breaker (opossum) para publicação RabbitMQ
- Chaos engineering configurável via `/v1/admin/chaos`

### Contratos

- Documentação de identidade JWT (`docs/contracts/identity.md`)
- Documentação de headers (`docs/contracts/headers.md`)
- Documentação de eventos (`docs/contracts/events.md`)
- API v1 estável

### Compliance

- Auditoria de ações sensíveis (CRUD pedidos/inventário)
- Auditoria de negações (ACCESS_DENIED)
- Retenção e exportação de audit log (ver `docs/compliance.md`)

---

## IA/LLM no serviço

O projeto deve habilitar uso de IA/LLM para:

- Previsão de demanda e otimização de inventário
- Detecção de anomalias em pedidos (fraude, padrões atípicos)
- Recomendações de reposição de estoque
- Análise de audit log e detecção de padrões suspeitos
- Documentação viva

### Requisitos para IA/LLM

- Dados para aprendizado (agregados, sem PII): histórico de pedidos, movimentações de inventário
- APIs estáveis para agentes: `/v1/orders`, `/v1/inventory`, `/v1/audit`
- Eventos documentados (`docs/contracts/events.md`)
- Segurança: ABAC, sem PII desnecessário, auditoria de acesso

---

## Assistentes de código no repositório

- **Desenvolvimento:** ao sugerir ou implementar mudanças, priorizar itens que aproximem dos critérios acima e habilitem IA/LLM.
- **Revisão de arquitetura:** garantir que novas features não quebrem contratos com spring-saas-core e py-payments-ledger.
- **Detalhes:** critérios finos e diretrizes técnicas estão neste documento e em `docs/BACKLOG-EVOLUCAO.md`.
- **Compliance:** auditoria, retenção e exportação em `docs/compliance.md`.

---

## Resumo em uma frase

O node-b2b-orders é a API B2B de Pedidos e Inventário da plataforma Fluxe, pronto para venda quando cumprir os critérios funcionais, de segurança, operacional, contratos e compliance acima, com suporte à integração com agentes IA/LLM.
