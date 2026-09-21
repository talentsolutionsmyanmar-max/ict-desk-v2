CREATE TABLE IF NOT EXISTS desk_forward_signals (
  id text PRIMARY KEY,
  version text NOT NULL,
  coin text NOT NULL,
  observed_at bigint NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS desk_forward_active ON desk_forward_signals (version, status, observed_at);
CREATE TABLE IF NOT EXISTS desk_model_states (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  observed_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS desk_model_events (
  id bigserial PRIMARY KEY,
  version text NOT NULL,
  observed_at bigint NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS desk_model_recent ON desk_model_events (version, observed_at DESC);
CREATE TABLE IF NOT EXISTS desk_recorder (
  id integer PRIMARY KEY CHECK (id = 1),
  lease_owner text,
  lease_until timestamptz,
  last_attempt timestamptz,
  last_success timestamptz,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
INSERT INTO desk_recorder (id) VALUES (1) ON CONFLICT DO NOTHING;
