# Backlog de Evolução

Estado atual por critério de "pronto para venda".

---

## Funcional

- [x] CRUD pedidos com ciclo de vida (created → confirmed → paid → cancelled)
- [x] CRUD inventário com reservas atômicas
- [x] Saga distribuída (pedido → charge_requested → payment.settled)
- [x] Idempotência via Idempotency-Key + Redis
- [x] Outbox para eventos de domínio (Prisma transaction + worker)
- [x] Auditoria consultável via GET /v1/audit
- [x] Exportação de audit log (GET /v1/audit/export)
- [x] Webhook de eventos para integradores externos
- [x] Order fulfillment lifecycle (ship, deliver)
- [x] Busca full-text / filtros avançados em pedidos

---

## Segurança

- [x] ABAC com DENY precedente e default-deny (AbacGuard + Policy)
- [x] RBAC via PermissionsGuard
- [x] Auditoria de ACCESS_DENIED
- [x] JWT validado (sub, tid, roles, perms, plan, region)
- [x] Sem credenciais hardcoded em código
- [x] Rate limiting por tenant/usuário (token bucket via Redis)
- [x] Rotação de JWT_SECRET sem downtime
- [x] OIDC/RS256 para produção (JWT_PUBLIC_KEY ou JWKS_URI)

---

## Operacional

- [x] Health checks (/v1/healthz, /v1/readyz com DB + Redis)
- [x] Métricas Prometheus (/v1/metrics)
- [x] OpenAPI (YAML + JSON + Swagger UI)
- [x] Docker multi-stage (api + worker)
- [x] docker-compose com postgres, redis, rabbitmq, prometheus, grafana
- [x] Scripts: up.sh, migrate.sh, seed.sh, smoke.sh
- [x] Circuit breaker (opossum) para publicação RabbitMQ
- [x] Chaos engineering (/v1/admin/chaos)
- [x] Alertas Grafana pré-configurados
- [x] Structured logging (JSON) em produção

---

## Contratos

- [x] docs/contracts/events.md
- [x] docs/contracts/identity.md
- [x] docs/contracts/headers.md
- [x] API v1 estável
- [x] Versionamento de contratos (changelog de breaking changes)
- [x] Schema registry para eventos

---

## Compliance

- [x] Auditoria de ações sensíveis (CRUD pedidos/inventário)
- [x] Auditoria de negações (ACCESS_DENIED)
- [x] docs/compliance.md
- [x] Retenção configurável de audit log (TTL/archival)
- [x] Política de privacidade de dados (PII handling)

---

## IA/LLM

- [x] API de dados agregados para análise de demanda
- [x] Endpoint de anomalias em pedidos
- [x] Documentação viva gerada por IA
- [x] Dados de inventário para previsão de reposição
