-- Convert tenant ID columns from varchar/text to uuid (idempotent)
DO $$
DECLARE
  t RECORD;
BEGIN
  -- Replace tenant_demo with UUID
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id' AND data_type != 'uuid'
  LOOP
    EXECUTE format('UPDATE %I SET tenant_id = ''00000000-0000-0000-0000-000000000002'' WHERE tenant_id = ''tenant_demo''', t.table_name);
  END LOOP;

  -- Convert Tenant.id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'id' AND data_type != 'uuid') THEN
    UPDATE tenants SET id = '00000000-0000-0000-0000-000000000002' WHERE id = 'tenant_demo';
    -- Note: FK drops and type conversion handled by spring-saas-core Liquibase migration 020
  END IF;
END $$;
