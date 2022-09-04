use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use gcp_bigquery_client::Client as BigQueryClient;
use std::env;
use std::{error::Error, net::SocketAddr};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::info;

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

    let mut app = pubsub::router()
        .merge(pages::router())
        .fallback(static_file_service)
        .layer(TraceLayer::new_for_http());

    // If the Google credentials are set, enable the stats collection endpoints
    let service_account_key = env::var("GOOGLE_SERVICE_ACCOUNT_KEY")
        .ok()
        .and_then(|key| serde_json::from_str(&key).ok());
    if let Some(service_account_key) = service_account_key {
        let bigquery = BigQueryClient::from_service_account_key(service_account_key, false)
            .await
            .expect("Error creating BigQuery client");
        app = app.merge(stats::router(bigquery));
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("listening on {}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .expect("Error running server on port");
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
