-- AlignPolicyWithSharedDb
-- This migration aligns the Prisma schema with the shared database
-- managed by spring-saas-core via Liquibase.
-- The policies table was created by Liquibase with TEXT columns
-- for allowed_plans and allowed_regions (JSON strings),
-- not TEXT[] arrays as originally defined in Prisma.
-- No actual DDL changes needed - the table already exists correctly.
SELECT 1;
