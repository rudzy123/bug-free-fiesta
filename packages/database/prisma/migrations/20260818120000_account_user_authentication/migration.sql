-- Account-user authentication: read_only role, hashed browser sessions,
-- and append-only security audit events (not document-chained).

ALTER TYPE "membership_role" ADD VALUE 'read_only';

CREATE TYPE "account_security_event_type" AS ENUM (
  'login_succeeded',
  'login_failed',
  'logout',
  'session_revoked'
);

CREATE TABLE "account_sessions" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "csrfTokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_sessions_tokenHash_key" ON "account_sessions"("tokenHash");
CREATE INDEX "account_sessions_user_id_idx" ON "account_sessions"("userId");
CREATE INDEX "account_sessions_expires_at_idx" ON "account_sessions"("expiresAt");

ALTER TABLE "account_sessions"
  ADD CONSTRAINT "account_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_sessions"
  ADD CONSTRAINT "account_sessions_token_hash_hex"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "account_sessions"
  ADD CONSTRAINT "account_sessions_csrf_token_hash_hex"
  CHECK ("csrfTokenHash" ~ '^[0-9a-f]{64}$');

CREATE TABLE "account_security_events" (
  "id" UUID NOT NULL,
  "type" "account_security_event_type" NOT NULL,
  "actorUserId" UUID,
  "sessionId" UUID,
  "requestId" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_security_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_security_events_actor_occurred_idx"
  ON "account_security_events"("actorUserId", "occurredAt");
CREATE INDEX "account_security_events_request_id_idx"
  ON "account_security_events"("requestId");

CREATE FUNCTION account_security_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'account_security_events are append-only';
END;
$$;

CREATE TRIGGER account_security_events_append_only
  BEFORE UPDATE OR DELETE ON account_security_events
  FOR EACH ROW
  EXECUTE FUNCTION account_security_events_forbid_mutation();
