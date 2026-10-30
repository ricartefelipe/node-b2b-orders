-- Registro durável de idempotência: gravado na mesma transação do efeito de negócio.
-- A unicidade (tenant, escopo, chave) é a garantia contra efeito duplicado; o Redis é só cache.
CREATE TABLE "idempotency_records" (
  "id"          TEXT NOT NULL,
  "tenant_id"   UUID NOT NULL,
  "scope"       TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "response"    JSONB NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_tenant_id_scope_key_key"
  ON "idempotency_records" ("tenant_id", "scope", "key");
