CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'pro',
  "region" TEXT NOT NULL DEFAULT 'region-a',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Role" (
  "name" TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "Permission" (
  "code" TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "UserRole" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "roleName" TEXT NOT NULL,
  CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "UserRole_roleName_fkey" FOREIGN KEY ("roleName") REFERENCES "Role"("name") ON DELETE CASCADE,
  CONSTRAINT "UserRole_userId_roleName_key" UNIQUE ("userId", "roleName")
);

CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roleName" TEXT NOT NULL,
  "permissionCode" TEXT NOT NULL,
  CONSTRAINT "RolePermission_roleName_fkey" FOREIGN KEY ("roleName") REFERENCES "Role"("name") ON DELETE CASCADE,
  CONSTRAINT "RolePermission_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "Permission"("code") ON DELETE CASCADE,
  CONSTRAINT "RolePermission_roleName_permissionCode_key" UNIQUE ("roleName", "permissionCode")
);

CREATE TABLE IF NOT EXISTS "Policy" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "permissionCode" TEXT NOT NULL UNIQUE,
  "effect" TEXT NOT NULL DEFAULT 'allow',
  "allowedPlans" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedRegions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FeatureFlag" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "rolloutPercent" INT NOT NULL DEFAULT 100,
  "allowedRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FeatureFlag_tenantId_name_key" UNIQUE ("tenantId", "name")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NULL,
  "actorSub" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Order" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "qty" INT NOT NULL,
  "price" NUMERIC(18,2) NOT NULL,
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "InventoryItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "availableQty" INT NOT NULL DEFAULT 0,
  "reservedQty" INT NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "InventoryItem_tenantId_sku_key" UNIQUE ("tenantId", "sku")
);

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
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
);

CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
CREATE INDEX IF NOT EXISTS "OutboxEvent_eventType_idx" ON "OutboxEvent"("eventType");
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_idx" ON "OutboxEvent"("status");
