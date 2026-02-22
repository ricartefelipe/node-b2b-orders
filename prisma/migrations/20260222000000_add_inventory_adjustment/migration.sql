CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "qty" INT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorSub" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL DEFAULT '',
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InventoryAdjustment_tenantId_sku_idx" ON "InventoryAdjustment"("tenantId", "sku");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_tenantId_createdAt_idx" ON "InventoryAdjustment"("tenantId", "createdAt");
