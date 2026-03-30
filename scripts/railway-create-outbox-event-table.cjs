/**
 * One-off: criar tabela "OutboxEvent" na base partilhada (Railway) quando
 * existe outbox_events (outro serviço) mas Prisma orders espera "OutboxEvent".
 * Uso: railway ssh 'cd /app && node scripts/railway-create-outbox-event-table.cjs'
 * (copiar para o container ou rodar via stdin — ver doc em deploy).
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INT NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lockedAt" TIMESTAMPTZ NULL,
  "lockedBy" TEXT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
  `CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "OutboxEvent_eventType_idx" ON "OutboxEvent"("eventType")`,
  `CREATE INDEX IF NOT EXISTS "OutboxEvent_status_idx" ON "OutboxEvent"("status")`,
];

async function main() {
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%outbox%'`,
  );
  console.log("tables:", JSON.stringify(rows));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
