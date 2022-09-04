use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use gcp_bigquery_client::Client as BigQueryClient;
use std::env;
use std::{error::Error, net::SocketAddr};
use tower_http::compression::CompressionLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{error, info};

mod pages;
mod pubsub;
mod stats;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Serve static files
    let static_file_service = get_service(ServeDir::new("static"))
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

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("listening on {}", addr);

    let app = api.merge(website).layer(TraceLayer::new_for_http());
    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .expect("Error running server on port");
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
