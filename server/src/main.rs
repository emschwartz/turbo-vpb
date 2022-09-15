use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use futures::try_join;
use gcp_bigquery_client::Client as BigQueryClient;
use std::{env, error::Error, net::SocketAddr};
use tokio::fs;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing::{debug, error, info};

mod metrics;
mod pages;
mod pubsub;
mod stats;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    info!("Starting TurboVPB server");

    // Make sure we can access the static file directory
    let static_dir = env::args().nth(1).unwrap_or_else(|| "static".to_string());
    fs::read_dir(&static_dir)
        .await
        .expect("Failed to read static directory")
        .next_entry()
        .await
        .expect("Failed to read file from static directory");
    debug!("Using static directory: {}", static_dir);

    // Serve static files
    let static_file_service = get_service(ServeDir::new(static_dir))
        .fallback(get_service(ServeFile::new("static/favicons/favicon.ico")))
        .handle_error(internal_service_error);

    let website = pages::router()
        .fallback(static_file_service)
        .layer(CompressionLayer::new());

    let mut api = pubsub::router();

    // If the Google credentials are set, enable the stats collection endpoints
    let service_account_key = env::var("GOOGLE_SERVICE_ACCOUNT_KEY")
        .ok()
        .and_then(|key| serde_json::from_str(&key).ok());
    if let Some(service_account_key) = service_account_key {
        match BigQueryClient::from_service_account_key(service_account_key, false).await {
            Ok(bigquery) => {
                info!("BigQuery client initialized");
                api = api.merge(stats::router(bigquery));
            }
            Err(err) => {
                error!("Failed to initialize BigQuery client: {err}");
            }
        }
    }

    let addr = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 0], 8080));
    info!("Listening on {}", addr);
    let app = api.merge(website).layer(TraceLayer::new_for_http());
    let app = Server::bind(&addr).serve(app.into_make_service());

    // Serve the metrics on a different port so they're not publicly exposed
    let metrics_addr = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 0], 8081));
    let metrics = Server::bind(&metrics_addr).serve(metrics::router().into_make_service());
    info!("Metrics listening on {}", metrics_addr);

    try_join!(app, metrics).expect("Server error");
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
