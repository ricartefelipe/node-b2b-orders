# Lista de alterações - Release "Pronto para Venda"

## P0 — Repo e qualidade

### Formatação e lint
- **Prettier** aplicado em todo o projeto (TS, JSON, MD, YAML)
- **ESLint** passa sem erros (warnings permanecem)

### Limpeza
- **Removida** pasta `.idea/`
- **Atualizado** `.gitignore` com `.idea/`, `*.iml`, `.vscode/`

### README
- **Clone URL corrigida:** `https://github.com/ricartefelipe/node-b2b-orders.git`
- README reescrito com: arquitetura, quick start, endpoints, eventos, auth, Demo Script
- Seção "Demo Script (3–5 minutos)" para apresentação comercial
- Links para `docs/contracts/`

## P1 — Bugs e robustez

### Rate limit hook (`src/main.ts`)
- **Correção crítica:** `return` após enviar 429 para encerrar request e não continuar pipeline
- **Bypass** para `/docs`, `/metrics`, `/healthz`, `/readyz`, `/openapi` (com e sem prefixo `/v1/`)
- Path extraído sem query string para bypass correto

### Eventos e integração payments
- **docs/contracts/events.md:** contrato canônico de `payment.charge_requested` e `payment.settled`
- Worker aceita `orderId`/`order_id` e `tenantId`/`tenant_id` em `payment.settled` (snake/camel)
- **scripts/publish-payment-settled.js:** script para simular py-payments-ledger na demo/smoke

### Outbox
- **docs/architecture/outbox.md:** documentação de transacionalidade e dispatcher
- Confirmação: ordem + outbox criados na mesma transação em OrdersService e Worker
- Dispatcher: retry/backoff exponencial, status DEAD após 7 tentativas

## P2 — Autorização e multi-tenancy

- **docs/contracts/identity.md:** JWT claims, RBAC, ABAC, TenantGuard
- **docs/contracts/headers.md:** headers obrigatórios e opcionais
- ABAC documentado: deny precedence, regras de plan/region

## P3 — Testes

### Unit tests
- **test/unit/orders.service.spec.ts:** createOrder, confirmOrder, cancelOrder
- **test/unit/auth.service.spec.ts:** issueToken (user not found, wrong password, success)
- **test/unit/abac.guard.spec.ts:** bypass, admin, deny, plan/region
- **test/unit/basic.spec.ts:** mantido (RedisService decode)

### Smoke E2E
- **scripts/smoke.sh:** novo passo 5b – simula `payment.settled` e valida PAID
- Smoke valida fluxo completo: CREATED → RESERVED → CONFIRMED → PAID

## P4 — Docker e produção

### Dockerfiles
- **api.Dockerfile / worker.Dockerfile:**
  - user `app` (non-root, uid 1001)
  - build com `npm ci`
  - `npm prune --omit=dev` após build para imagem enxuta
- **api.Dockerfile:** HEALTHCHECK via wget + grep em `/v1/healthz`

### docker-compose.yml
- Removido atributo `version` (obsoleto)

### Prometheus
- **observability/prometheus/prometheus.yml:** `metrics_path` corrigido para `/v1/metrics`

## Arquivos criados

- `docs/contracts/events.md`
- `docs/contracts/identity.md`
- `docs/contracts/headers.md`
- `docs/architecture/outbox.md`
- `scripts/publish-payment-settled.js`
- `test/unit/orders.service.spec.ts`
- `test/unit/auth.service.spec.ts`
- `test/unit/abac.guard.spec.ts`

## Arquivos modificados

- `src/main.ts` (rate limit, bypass, return)
- `README.md` (completo, URL correta, Demo Script)
- `.gitignore` (.idea, .vscode)
- `docker/api.Dockerfile` (non-root, healthcheck)
- `docker/worker.Dockerfile` (non-root)
- `docker-compose.yml` (version removido)
- `observability/prometheus/prometheus.yml` (metrics path)
- `scripts/smoke.sh` (payment.settled, source .env)
- `package.json` (removido @nestjs/testing se presente)

## Comandos de verificação

```bash
npm ci
npm run lint
npm run test
./scripts/up.sh && ./scripts/migrate.sh && ./scripts/seed.sh && ./scripts/smoke.sh
```
