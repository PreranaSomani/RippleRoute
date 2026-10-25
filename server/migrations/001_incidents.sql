CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS rippleroute;
CREATE TABLE IF NOT EXISTS rippleroute.incidents (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_saved_at_idx ON rippleroute.incidents (saved_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS rippleroute.incident_events (
  occurred_at timestamptz NOT NULL,
  incident_id uuid NOT NULL REFERENCES rippleroute.incidents(id),
  kind text NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (occurred_at, incident_id)
);
SELECT create_hypertable('rippleroute.incident_events', 'occurred_at', if_not_exists => TRUE);
