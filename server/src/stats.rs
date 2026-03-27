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

#[derive(Deserialize, Debug)]
struct CallRecord {
    duration: u32,
    result: Option<String>,
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
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO calls (session_id, duration, result, timestamp) VALUES (?1, ?2, ?3, datetime('now'))",
            params![session_id, call.duration, call.result],
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
) -> Result<(), StatusCode> {
    if session_id.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO texts (session_id, timestamp) VALUES (?1, datetime('now'))",
            params![session_id],
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
