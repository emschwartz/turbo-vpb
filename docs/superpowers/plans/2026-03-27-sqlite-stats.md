# SQLite Stats Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BigQuery with a local SQLite database for call/text stats storage.

**Architecture:** Swap the `gcp-bigquery-client` dependency for `tokio-rusqlite` (async wrapper around rusqlite, runs SQLite operations on a dedicated background thread). The stats module will accept a `tokio_rusqlite::Connection` (which is `Clone`) and insert rows directly on each POST via `.call()`. The SQLite file lives on a Fly volume at `/data/turbovpb.db`.

**Tech Stack:** Rust, tokio-rusqlite (bundled SQLite), Axum 0.6, Fly.io volumes

---

### Task 1: Replace BigQuery with SQLite in server code

**Files:**
- Modify: `server/Cargo.toml`
- Modify: `server/src/stats.rs`
- Modify: `server/src/main.rs`

- [ ] **Step 1: Update Cargo.toml dependencies**

In `server/Cargo.toml`, remove these two lines from `[dependencies]`:
```
gcp-bigquery-client = "0.17"
time = "0.3"
```

Add this line to `[dependencies]`:
```toml
tokio-rusqlite = { version = "0.6", features = ["bundled"] }
```

- [ ] **Step 2: Replace the entire contents of `server/src/stats.rs`**

```rust
use axum::extract::{Extension, Path};
use axum::{http::StatusCode, routing::post, Json, Router};
use serde::Deserialize;
use tokio_rusqlite::Connection;
use tracing::{error, instrument, trace};

pub fn router(db: Connection) -> Router {
    Router::new()
        .route("/api/stats/sessions/:session_id/calls", post(post_call))
        .route("/api/stats/sessions/:session_id/texts", post(post_text))
        // Backwards compatibility
        .route("/sessions/:session_id/calls", post(post_call))
        .route("/sessions/:session_id/texts", post(post_text))
        .layer(Extension(db))
}

#[derive(Deserialize, Debug)]
struct CallRecord {
    duration: u32,
    result: Option<String>,
}

#[instrument(skip(db))]
async fn post_call(
    Path(session_id): Path<String>,
    Extension(db): Extension<Connection>,
    Json(call): Json<CallRecord>,
) -> Result<(), StatusCode> {
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO calls (session_id, duration, result, timestamp) VALUES (?1, ?2, ?3, datetime('now'))",
            rusqlite::params![session_id, call.duration, call.result],
        )?;
        Ok(())
    })
    .await
    .map_err(|err| {
        error!("Error inserting call record: {err}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    trace!("Recorded call");
    Ok(())
}

#[instrument(skip(db))]
async fn post_text(
    Path(session_id): Path<String>,
    Extension(db): Extension<Connection>,
) -> Result<(), StatusCode> {
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO texts (session_id, timestamp) VALUES (?1, datetime('now'))",
            rusqlite::params![session_id],
        )?;
        Ok(())
    })
    .await
    .map_err(|err| {
        error!("Error inserting text record: {err}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    trace!("Recorded text");
    Ok(())
}
```

Key changes from the old version:
- `router()` takes a `tokio_rusqlite::Connection` (which is `Clone`, no `Arc<Mutex<>>` needed) instead of `BigQueryClient`
- Uses `.layer(Extension(db))` to match the pattern used in `pubsub.rs`
- Handlers insert rows via `db.call(|conn| { ... })`, which runs on a background thread (non-blocking)
- `rusqlite::params!` is available because `tokio-rusqlite` re-exports `rusqlite`
- Removed: `ServerState`, `BigQueryRecord`, `BigQueryCallRecord`, `Serialize` derive on `CallRecord`, background flush task, `time` crate usage
- Timestamps use SQLite's `datetime('now')` (UTC) instead of `time::OffsetDateTime`

- [ ] **Step 3: Replace the contents of `server/src/main.rs`**

```rust
use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use futures::try_join;
use std::{env, error::Error, net::SocketAddr, path::PathBuf};
use tokio::fs;
use tokio_rusqlite::Connection;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing::{debug, info};

mod metrics;
mod pages;
mod pubsub;
mod stats;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    info!("Starting TurboVPB server");

    // Make sure we can access the static file directory
    let static_dir: PathBuf = env::args().nth(1).unwrap_or_else(|| "static".to_string()).into();
    fs::read_dir(&static_dir)
        .await
        .expect("Failed to read static directory")
        .next_entry()
        .await
        .expect("Failed to read file from static directory");
    debug!("Using static directory: {}", static_dir.display());

    // Serve static files
    let static_file_service = get_service(ServeDir::new(&static_dir))
        .fallback(get_service(ServeFile::new(static_dir.join("favicons/favicon.ico"))))
        .handle_error(internal_service_error);

    let website = pages::router()
        .fallback(static_file_service)
        .layer(CompressionLayer::new());

    // Initialize SQLite database
    let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "data/turbovpb.db".to_string());
    let db_dir = PathBuf::from(&db_path);
    if let Some(parent) = db_dir.parent() {
        fs::create_dir_all(parent)
            .await
            .expect("Failed to create database directory");
    }
    let db = Connection::open(&db_path)
        .await
        .expect("Failed to open SQLite database");
    db.call(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                duration INTEGER NOT NULL,
                result TEXT,
                timestamp TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS texts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );",
        )?;
        Ok(())
    })
    .await
    .expect("Failed to create database tables");
    info!("SQLite database initialized at {db_path}");

    let api = pubsub::router().merge(stats::router(db));

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Listening on {}", addr);
    let app = api.merge(website).layer(TraceLayer::new_for_http());
    let app = Server::bind(&addr).serve(app.into_make_service());

    // Serve the metrics on a different port so they're not publicly exposed
    let metrics_addr = SocketAddr::from(([0, 0, 0, 0], 8081));
    let metrics = Server::bind(&metrics_addr).serve(metrics::router().into_make_service());
    info!("Metrics listening on {}", metrics_addr);

    try_join!(app, metrics).expect("Server error");
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
```

Key changes:
- Removed: `gcp_bigquery_client` import, `serde_json` import, `error` tracing import, `Arc`/`Mutex` imports, `GOOGLE_SERVICE_ACCOUNT_KEY` handling, conditional BigQuery init
- Added: `tokio_rusqlite::Connection` import, async SQLite init via `Connection::open().await` and `db.call()`
- `api` is no longer `mut` since stats are always merged
- Creates the DB directory if it doesn't exist (`data/` locally, `/data/` on Fly)
- No `Arc<Mutex<>>` wrapping needed since `tokio_rusqlite::Connection` is already `Clone`

- [ ] **Step 4: Verify full project compiles**

Run: `cd server && cargo build 2>&1 | tail -5`

Expected: Successful build. The `bundled` feature compiles SQLite from C source, so this may take a minute the first time.

- [ ] **Step 5: Commit**

```bash
cd server && git add Cargo.toml Cargo.lock src/stats.rs src/main.rs && git commit -m "feat: replace BigQuery with SQLite for stats storage"
```

---

### Task 2: Smoke test the server locally

- [ ] **Step 1: Start the server**

Run: `cd server && mkdir -p data && DATABASE_PATH=data/turbovpb.db cargo run`

Expected: Server starts, logs "SQLite database initialized at data/turbovpb.db" and "Listening on 0.0.0.0:8080".

- [ ] **Step 2: Test the call stats endpoint**

In a separate terminal:
```bash
curl -X POST http://localhost:8080/api/stats/sessions/test-session/calls \
  -H "Content-Type: application/json" \
  -d '{"duration": 120, "result": "answered"}'
```

Expected: 200 OK (empty body).

- [ ] **Step 3: Test the text stats endpoint**

```bash
curl -X POST http://localhost:8080/api/stats/sessions/test-session/texts
```

Expected: 200 OK (empty body).

- [ ] **Step 4: Verify data was written to SQLite**

```bash
sqlite3 server/data/turbovpb.db "SELECT * FROM calls; SELECT * FROM texts;"
```

Expected: One row in each table with session_id "test-session".

- [ ] **Step 5: Clean up test database**

```bash
rm server/data/turbovpb.db
```

---

### Task 6: Update Dockerfile

**Files:**
- Modify: `server/Dockerfile`

- [ ] **Step 1: Remove ca-certificates installation from the runtime stage**

In `server/Dockerfile`, replace the runtime stage's apt-get block:

```dockerfile
# Install the root certificates
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*
```

with nothing (delete those lines entirely). The server no longer makes outbound HTTPS requests.

- [ ] **Step 2: Add a /data directory for the SQLite database**

After the `WORKDIR /usr/app` line and before the `COPY --from=builder` line, add:

```dockerfile
RUN mkdir -p /data
```

This ensures the mount point exists even if no volume is attached (e.g. during local Docker testing).

- [ ] **Step 3: Commit**

```bash
cd server && git add Dockerfile && git commit -m "chore: remove ca-certificates, add /data dir for SQLite"
```

---

### Task 7: Update fly.toml with volume mount

**Files:**
- Modify: `server/fly.toml`

- [ ] **Step 1: Add mounts section and DATABASE_PATH env var**

In `server/fly.toml`, add the volume mount after the `[experimental]` section:

```toml
[mounts]
source = "turbovpb_data"
destination = "/data"
```

Also add `DATABASE_PATH` to the `[env]` section:

```toml
[env]
RUST_LOG = "turbovpb_server=info"
RUST_BACKTRACE = "1"
DATABASE_PATH = "/data/turbovpb.db"
```

- [ ] **Step 2: Commit**

```bash
cd server && git add fly.toml && git commit -m "chore: add Fly volume mount for SQLite database"
```

---

### Task 8: Create Fly volume and deploy

- [ ] **Step 1: Create the Fly volume**

Run from `server/` directory:

```bash
cd server && fly volumes create turbovpb_data --region ord --size 1
```

The app runs in `ord` (Chicago). 1 GB is plenty.

- [ ] **Step 2: Deploy**

```bash
cd server && fly deploy
```

Expected: Successful deploy. Check logs for "SQLite database initialized at /data/turbovpb.db".

- [ ] **Step 3: Verify the deployment**

```bash
cd server && fly logs | head -20
```

Look for the "SQLite database initialized" log line and no errors.
