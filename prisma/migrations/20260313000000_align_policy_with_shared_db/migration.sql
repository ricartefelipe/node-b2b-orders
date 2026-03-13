-- AlignPolicyWithSharedDb
-- Rename "Policy" -> "policies" to match spring-saas-core Liquibase schema.
-- Add missing columns managed by spring-saas-core.
ALTER TABLE IF EXISTS "Policy" RENAME TO "policies";

-- Rename columns to snake_case (matching Liquibase schema)
ALTER TABLE "policies" RENAME COLUMN IF EXISTS "permissionCode" TO "permission_code";
ALTER TABLE "policies" RENAME COLUMN IF EXISTS "createdAt" TO "created_at";

-- Convert array columns to text (JSON strings) if they are arrays
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policies' AND column_name = 'allowedPlans' AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE "policies" ADD COLUMN "allowed_plans" TEXT NOT NULL DEFAULT '[]';
    UPDATE "policies" SET "allowed_plans" = (
      SELECT COALESCE(
        '[' || string_agg('"' || elem || '"', ',') || ']',
        '[]'
      )
      FROM unnest("allowedPlans") AS elem
    );
    ALTER TABLE "policies" DROP COLUMN "allowedPlans";
    ALTER TABLE "policies" ADD COLUMN "allowed_regions" TEXT NOT NULL DEFAULT '[]';
    UPDATE "policies" SET "allowed_regions" = (
      SELECT COALESCE(
        '[' || string_agg('"' || elem || '"', ',') || ']',
        '[]'
      )
      FROM unnest("allowedRegions") AS elem
    );
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
