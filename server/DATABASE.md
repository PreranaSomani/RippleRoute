# Persistent incident history

Credentials live only in `server/.env`. Keep the existing `DATABASE_URL` private; never use a `VITE_` database setting. The API continues binding to localhost. This feature uses the application's existing local-only trust model; it is not an authenticated multi-user service.

## Setup

```sh
npm install
npm run db:migrate
npm run server
```

The repeatable, transactional migration creates only the `rippleroute` schema, its incident table, indexes, and TimescaleDB event hypertable. It requires permission to create these objects and access to the TimescaleDB extension. It does not rewrite existing application tables or automatically run on server startup.

TLS verifies the certificate chain and hostname. Connection-string SSL options are removed before configuring `pg`, so `sslmode=require` cannot silently override verification. If the service presents an untrusted chain, obtain its CA through a trusted Tiger Data/account or administrator channel and add this to `server/.env`:

```dotenv
DATABASE_CA_FILE=/absolute/path/to/trusted-service-ca.pem
```

Do not disable TLS verification or trust a certificate fetched from an unauthenticated connection. Restart the server after configuration changes. A newly provisioned service may still be waiting for its signed certificate.

## Live insert and retrieval verification

```sh
npm run db:migrate
npm run db:verify
```

`db:verify` uses the actual baseline fleet calculations, commits one saved incident and timestamped event, retries with the same idempotency key, reads the incident back, and checks that exactly one event exists in the hypertable. It verifies TLS via `pg_stat_ssl`. It prints only the resulting record UUID, never the connection URL. The verification record remains visible in Saved History. A nonzero exit means verification failed; no success is inferred from configuration alone.

## Browser

Run `npm run dev`. Create a disruption or run fleet allocation, then open Decision Replay. Select a local timeline event and click **Save selected incident**. Success appears only after the database transaction commits. Refresh the page and open **Saved History**; select the saved record to view its frozen route/allocation details. The local timeline remains in memory and resets on reload. Opening a database snapshot never restores or changes the current simulation.

Test a second record with Union Depot disrupted and a new fleet allocation. Both snapshots should retain their respective results. Stop the backend or disconnect the database to verify an explicit error rather than a false save confirmation.

## API

- `POST /api/incidents`: `{idempotencyKey: UUID, event: DecisionEvent}`. Route structures and current outcomes are validated against the server network; fleet reports must equal a server recomputation. Summaries are derived server-side.
- `GET /api/incidents`: newest 50 snapshots; optional ISO timestamp `before` filter.
- `GET /api/incidents/:id`: one immutable snapshot.

The incident and hypertable event are written in one transaction with parameterized queries. Reusing a key with the same canonical snapshot returns the original record; a different snapshot returns 409. Timestamps are the simulation's recorded event times; `saved_at` is assigned by PostgreSQL. Saved snapshots remain unchanged if future simulation code changes. No background saves are performed.
