-- Defense in depth: application roles must not UPDATE, DELETE, or TRUNCATE
-- hash-chained audit rows. Triggers already reject UPDATE/DELETE. This migration
-- adds TRUNCATE protection and a non-superuser role that cannot mutate rows.
-- A PostgreSQL superuser can still disable triggers and replace the table;
-- the hash chain alone does not prevent that. See ADR-0015.

CREATE OR REPLACE FUNCTION audit_logs_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_forbid_truncate ON audit_logs;
CREATE TRIGGER audit_logs_forbid_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_logs_forbid_mutation();

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'esign_app') THEN
    CREATE ROLE esign_app NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON TABLE audit_logs FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE audit_logs TO esign_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM esign_app;

COMMENT ON TABLE audit_logs IS
  'Append-only hash-chained audit. Application role esign_app may SELECT and INSERT only. Superuser rewrite is a residual threat requiring external checkpoint anchoring.';
