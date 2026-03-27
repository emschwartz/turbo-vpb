# Stats: BigQuery to SQLite Migration

## Summary

Replace BigQuery with a local SQLite database for storing call and text stats. The data is low-volume and only queried manually, so a managed cloud data warehouse is unnecessary overhead. This eliminates the `gcp-bigquery-client` dependency, the `GOOGLE_SERVICE_ACCOUNT_KEY` env var, and all batching logic.

## Schema

One SQLite file at a configurable path (`DATABASE_PATH` env var, defaulting to `data/turbovpb.db`) with two tables:

```sql
CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    duration INTEGER NOT NULL,
    result TEXT,
    timestamp TEXT NOT NULL  -- RFC 3339
);

CREATE TABLE IF NOT EXISTS texts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL  -- RFC 3339
);
```

## Server Changes

### `Cargo.toml`

- Remove: `gcp-bigquery-client`, `time`
- Add: `tokio-rusqlite` with `bundled` feature (async wrapper around rusqlite, compiles SQLite from source)

### `stats.rs`

- `router()` takes a `tokio_rusqlite::Connection` (which is `Clone`, no `Arc<Mutex<>>` needed) instead of a `BigQueryClient`
- Each POST handler (`post_call`, `post_text`) inserts a row directly (no batching)
- Remove: `ServerState`, `BigQueryRecord`, `BigQueryCallRecord`, background `tokio::spawn` flush loop
- Keep: `CallRecord` struct, route paths (including backwards-compat paths)

### `main.rs`

- Open/create SQLite DB at startup, run `CREATE TABLE IF NOT EXISTS` for both tables
- Pass connection to `stats::router()`
- Stats are always enabled (no conditional gating)
- Remove: all BigQuery/GCP imports and initialization, `GOOGLE_SERVICE_ACCOUNT_KEY` handling

### `Dockerfile`

- Remove `ca-certificates` installation (no longer making outbound HTTPS calls to GCP)

## Fly.io Changes

### `fly.toml`

Add a volume mount:

```toml
[mounts]
source = "turbovpb_data"
destination = "/data"
```

### Volume creation

Run from `server/` directory:

```bash
fly volumes create turbovpb_data --region <region> --size 1
```

1 GB is plenty for these small records.

## What Gets Removed

- All BigQuery batching logic (the `ServerState`, `TableDataInsertAllRequest` swap, background flush loop)
- `BigQueryRecord` / `BigQueryCallRecord` wrapper types
- `GOOGLE_SERVICE_ACCOUNT_KEY` env var and conditional init
- `gcp-bigquery-client`, `time`, and `serde_json` crate dependencies
- `ca-certificates` apt package in Dockerfile
