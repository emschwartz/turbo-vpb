use axum::extract::{Path, State};
use axum::{http::StatusCode, routing::post, Json, Router};
use gcp_bigquery_client::model::table_data_insert_all_request::TableDataInsertAllRequest;
use gcp_bigquery_client::Client as BigQueryClient;
use serde::{Deserialize, Serialize};
use std::{mem, sync::Arc, time::Duration};
use time::{serde::rfc3339, OffsetDateTime};
use tokio::{sync::Mutex, time::interval};
use tracing::{error, instrument, trace};

static BIGQUERY_PROJECT_ID: &str = "turbovpb";
static BIGQUERY_DATASET_ID: &str = "stats";
const SUBMISSION_INTERVAL: Duration = Duration::from_secs(30);

/// Keep track of the requests we're batching up to send to BigQuery
#[derive(Clone, Default)]
struct ServerState {
    calls: Arc<Mutex<TableDataInsertAllRequest>>,
    texts: Arc<Mutex<TableDataInsertAllRequest>>,
}

/// These fields will be sent for both calls and texts
#[derive(Serialize, Debug)]
struct BigQueryRecord {
    session_id: String,
    #[serde(with = "rfc3339")]
    timestamp: OffsetDateTime,
}

/// These fields will be sent for calls
#[derive(Serialize, Debug)]
struct BigQueryCallRecord {
    #[serde(flatten)]
    call: CallRecord,

    #[serde(flatten)]
    record: BigQueryRecord,
}

/// Panics if run outside of a Tokio Runtime
pub fn router(bigquery: BigQueryClient) -> Router {
    let state = ServerState::default();

    let router = Router::new()
        .route("/api/stats/sessions/:session_id/calls", post(post_call))
        .route("/api/stats/sessions/:session_id/texts", post(post_text))
        .with_state(state.clone());

    // Start a background task to submit stats to BigQuery on an interval
    tokio::spawn(async move {
        let mut submission_interval = interval(SUBMISSION_INTERVAL);
        loop {
            submission_interval.tick().await;

            let calls = mem::replace(&mut *state.calls.lock().await, Default::default());
            let texts = mem::replace(&mut *state.texts.lock().await, Default::default());

            if !calls.is_empty() {
                let num_calls = calls.len();
                if let Err(err) = bigquery
                    .tabledata()
                    .insert_all(BIGQUERY_PROJECT_ID, BIGQUERY_DATASET_ID, "calls", calls)
                    .await
                {
                    error!("Error submitting {num_calls} call records to BigQuery: {err:?}");
                }
                trace!("Submitted {num_calls} call records to BigQuery");
            }

            if !texts.is_empty() {
                let num_texts = texts.len();
                if let Err(err) = bigquery
                    .tabledata()
                    .insert_all(BIGQUERY_PROJECT_ID, BIGQUERY_DATASET_ID, "texts", texts)
                    .await
                {
                    error!("Error submitting {num_texts} text records to BigQuery: {err:?}");
                }
                trace!("Submitted {num_texts} text records to BigQuery");
            }
        }
    });

    router
}

#[derive(Deserialize, Serialize, Debug)]
struct CallRecord {
    duration: u32,
    result: Option<String>,
}

#[instrument(skip(state))]
async fn post_call(
    Path(session_id): Path<String>,
    State(state): State<ServerState>,
    Json(call): Json<CallRecord>,
) -> Result<(), StatusCode> {
    let record = BigQueryCallRecord {
        call,
        record: BigQueryRecord {
            session_id,
            timestamp: OffsetDateTime::now_utc(),
        },
    };
    state
        .calls
        .lock()
        .await
        .add_row(None, record)
        .map_err(|err| {
            error!("Error adding call record to BigQuery request: {err:?}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(())
}

#[instrument(skip(state))]
async fn post_text(
    Path(session_id): Path<String>,
    State(state): State<ServerState>,
) -> Result<(), StatusCode> {
    let record = BigQueryRecord {
        session_id,
        timestamp: OffsetDateTime::now_utc(),
    };
    state
        .texts
        .lock()
        .await
        .add_row(None, record)
        .map_err(|err| {
            error!("Error adding text record to BigQuery request: {err:?}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(())
}
