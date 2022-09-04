use axum::extract::{Extension, Path};
use axum::{http::StatusCode, routing::post, Json, Router};
use gcp_bigquery_client::model::table_data_insert_all_request::TableDataInsertAllRequest;
use gcp_bigquery_client::Client as BigQueryClient;
use serde::{Deserialize, Serialize};
use time::{serde::rfc3339, OffsetDateTime};
use tracing::{error, instrument};

static BIGQUERY_PROJECT_ID: &str = "turbovpb";
static BIGQUERY_DATASET_ID: &str = "stats";

pub fn router(bigquery: BigQueryClient) -> Router {
    let router = Router::new()
        .route("/sessions/:session_id/calls", post(post_call))
        .route("/sessions/:session_id/texts", post(post_text))
        .layer(Extension(bigquery));

    router
}

#[derive(Deserialize, Serialize, Debug)]
struct CallRecord {
    duration: u32,
    result: Option<String>,
}

#[derive(Serialize, Debug)]
struct BigQueryRecord {
    session_id: String,
    #[serde(with = "rfc3339")]
    timestamp: OffsetDateTime,
}

#[derive(Serialize, Debug)]
struct BigQueryCallRecord {
    #[serde(flatten)]
    call: CallRecord,

    #[serde(flatten)]
    record: BigQueryRecord,
}

#[instrument(skip(bigquery))]
async fn post_call(
    Path(session_id): Path<String>,
    Json(call): Json<CallRecord>,
    Extension(bigquery): Extension<BigQueryClient>,
) -> Result<(), StatusCode> {
    let record = BigQueryCallRecord {
        call,
        record: BigQueryRecord {
            session_id,
            timestamp: OffsetDateTime::now_utc(),
        },
    };
    let mut insert = TableDataInsertAllRequest::new();
    insert.add_row(None, record).map_err(|err| {
        error!("Failed to add row to BigQuery insert request: {err}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    bigquery
        .tabledata()
        .insert_all(BIGQUERY_PROJECT_ID, BIGQUERY_DATASET_ID, "calls", insert)
        .await
        .map_err(|err| {
            error!("Error sending row to BigQuery: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(())
}

#[instrument(skip(bigquery))]
async fn post_text(
    Path(session_id): Path<String>,
    Extension(bigquery): Extension<BigQueryClient>,
) -> Result<(), StatusCode> {
    let record = BigQueryRecord {
        session_id,
        timestamp: OffsetDateTime::now_utc(),
    };
    let mut insert = TableDataInsertAllRequest::new();
    insert.add_row(None, record).map_err(|err| {
        error!("Failed to add row to BigQuery insert request: {err}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    bigquery
        .tabledata()
        .insert_all(BIGQUERY_PROJECT_ID, BIGQUERY_DATASET_ID, "texts", insert)
        .await
        .map_err(|err| {
            error!("Error sending row to BigQuery: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(())
}
