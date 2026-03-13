-- AlignPolicyWithSharedDb
-- Rename "Policy" -> "policies" to match spring-saas-core Liquibase schema.
ALTER TABLE IF EXISTS "Policy" RENAME TO "policies";

-- Rename columns to snake_case (matching Liquibase schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policies' AND column_name = 'permissionCode'
  ) THEN
    ALTER TABLE "policies" RENAME COLUMN "permissionCode" TO "permission_code";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policies' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "policies" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
END $$;

-- Convert array columns to text (JSON strings) if they are arrays
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policies' AND column_name = 'allowedPlans' AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE "policies" ADD COLUMN "allowed_plans" TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE "policies" ADD COLUMN "allowed_regions" TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE "policies" DROP COLUMN "allowedPlans";
    ALTER TABLE "policies" DROP COLUMN "allowedRegions";
  END IF;
END $$;

-- Ensure columns exist for shared schema compatibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'allowed_plans') THEN
    ALTER TABLE "policies" ADD COLUMN "allowed_plans" TEXT NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'allowed_regions') THEN
    ALTER TABLE "policies" ADD COLUMN "allowed_regions" TEXT NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'enabled') THEN
    ALTER TABLE "policies" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'notes') THEN
    ALTER TABLE "policies" ADD COLUMN "notes" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'updated_at') THEN
    ALTER TABLE "policies" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;
