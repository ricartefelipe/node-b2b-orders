# Runbook — Baseline Prisma (staging / Railway)

Use quando:

- `prisma migrate deploy` falha com **P3005** (*database schema is not empty*).
- `prisma migrate status` lista migrações como **não aplicadas**, mas as tabelas **já existem** (histórico `_prisma_migrations` vazio ou inconsistente).

**Não** use em produção sem backup e validação explícita do schema.

---

## O que está a acontecer

O PostgreSQL tem objetos no `public`, mas o Prisma não tem registo coerente em `_prisma_migrations`. A primeira `migration.sql` assume BD vazio → P3005. O `entrypoint` do serviço pode ignorar P3005 e arrancar na mesma; convém **corrigir o histórico** para futuros `migrate deploy` funcionarem.

---

## Pré-requisitos

- Railway CLI logado; repo `node-b2b-orders` ligado ao projecto e ambiente **staging** (`railway status`).
- Confiança de que o **schema actual** corresponde ao que estas migrações criariam. Se duvidar, inspecione tabelas/colunas antes ou use BD de staging descartável e `migrate deploy` em BD vazio.

---

## Opção A — Script na imagem (recomendado após deploy com este script incluído)

```bash
cd node-b2b-orders
railway ssh -s node-b2b-orders -- /app/scripts/prisma-baseline-resolve.sh
```

Depois: **Redeploy** opcional do serviço no painel (o processo já em execução não precisa, mas um deploy limpo confirma o próximo arranque).

---

## Opção B — Comandos manuais (qualquer build com `npx` + `prisma/` em `/app`)

Dentro do container (`railway ssh -s node-b2b-orders`), em `/app`:

```sh
npx prisma migrate resolve --applied "20260216024000_init"
npx prisma migrate resolve --applied "20260222000000_add_inventory_adjustment"
npx prisma migrate resolve --applied "20260303000000_add_products"
npx prisma migrate resolve --applied "20260312000000_add_fulfillment_fields"
npx prisma migrate resolve --applied "20260312000000_add_webhook_tables"
npx prisma migrate resolve --applied "20260312100000_add_order_total_amount"
npx prisma migrate resolve --applied "20260313000000_align_policy_with_shared_db"
npx prisma migrate deploy
npx prisma migrate status
```

---

## Opção C — Staging descartável

Apagar schema/dados do Postgres de staging (ou criar BD nova), apontar `DATABASE_URL`, novo deploy: `migrate deploy` corre em BD vazio sem baseline.

---

## Verificação

- `npx prisma migrate status`: nenhuma migração pendente.
- `GET https://...node-b2b-orders-staging.../v1/healthz` → 200.
- Smoke (opcional): checklist na fluxe-b2b-suite (`CHECKLIST-PEDIDO-STAGING`).

---

## Referências

- [Prisma — Baseline a database](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baseline)
- `docker/entrypoint.sh` — comportamento em P3005 no arranque
