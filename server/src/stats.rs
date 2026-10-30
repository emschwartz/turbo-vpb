use axum::extract::{Path, State};
use axum::{http::StatusCode, routing::post, Json, Router};
use serde::Deserialize;
use tokio_rusqlite::{params, rusqlite, Connection};
use tracing::{error, instrument, trace};

pub fn router(db: Connection) -> Router {
    Router::new()
        .route("/api/stats/sessions/{session_id}/calls", post(post_call))
        .route("/api/stats/sessions/{session_id}/texts", post(post_text))
        // Backwards compatibility
        .route("/sessions/{session_id}/calls", post(post_call))
        .route("/sessions/{session_id}/texts", post(post_text))
        .with_state(db)
}

/// Creates the stats tables, and adds the columns newer connect pages send.
pub fn init_db(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
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
    for table in ["calls", "texts"] {
        for column in ["extension_version", "domain"] {
            add_column_if_missing(conn, table, column)?;
        }
    }
    Ok(())
}

fn add_column_if_missing(
    conn: &rusqlite::Connection,
    table: &str,
    column: &str,
) -> rusqlite::Result<()> {
    let exists: bool = conn.query_row(
        &format!("SELECT count(*) > 0 FROM pragma_table_info('{table}') WHERE name = ?1"),
        params![column],
        |row| row.get(0),
    )?;
    if !exists {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} TEXT"), [])?;
    }
    Ok(())
}

/// Where a call or text came from. Connect pages before these fields
/// existed send neither, so both are stored as NULL for them.
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct Source {
    extension_version: Option<String>,
    domain: Option<String>,
}

impl Source {
    fn is_valid(&self) -> bool {
        self.extension_version
            .as_ref()
            .is_none_or(|v| v.len() <= 64)
            && self.domain.as_ref().is_none_or(|d| d.len() <= 256)
    }
}

#[derive(Deserialize, Debug)]
struct CallRecord {
    duration: u32,
    result: Option<String>,
    #[serde(flatten)]
    source: Source,
}

#[instrument(skip(db))]
async fn post_call(
    Path(session_id): Path<String>,
    State(db): State<Connection>,
    Json(call): Json<CallRecord>,
) -> Result<(), StatusCode> {
    if session_id.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }
    if let Some(ref result) = call.result {
        if result.len() > 256 {
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    if !call.source.is_valid() {
        return Err(StatusCode::BAD_REQUEST);
    }
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO calls (session_id, duration, result, extension_version, domain, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            params![session_id, call.duration, call.result, call.source.extension_version, call.source.domain],
        )?;
        Ok::<(), rusqlite::Error>(())
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
    State(db): State<Connection>,
    source: Option<Json<Source>>,
) -> Result<(), StatusCode> {
    if session_id.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }
    // Older connect pages post texts with no body
    let source = source.map(|Json(source)| source).unwrap_or_default();
    if !source.is_valid() {
        return Err(StatusCode::BAD_REQUEST);
    }
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO texts (session_id, extension_version, domain, timestamp) VALUES (?1, ?2, ?3, datetime('now'))",
            params![session_id, source.extension_version, source.domain],
        )?;
        Ok::<(), rusqlite::Error>(())
    })
    .await
    .map_err(|err| {
        error!("Error inserting text record: {err}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    trace!("Recorded text");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_db_adds_source_columns_to_existing_tables() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE calls (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, duration INTEGER NOT NULL, result TEXT, timestamp TEXT NOT NULL);
            CREATE TABLE texts (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, timestamp TEXT NOT NULL);
            INSERT INTO calls (session_id, duration, timestamp) VALUES ('old', 1000, '2026-01-01 00:00:00');",
        )
        .unwrap();

        init_db(&conn).unwrap();
        // Running again on an already-migrated database is a no-op
        init_db(&conn).unwrap();

        conn.execute(
            "INSERT INTO texts (session_id, extension_version, domain, timestamp) VALUES ('s', '0.11.5', 'www.votebuilder.com', '2026-01-01 00:00:00')",
            [],
        )
        .unwrap();
        let old: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT extension_version, domain FROM calls WHERE session_id = 'old'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(old, (None, None));
    }
}
