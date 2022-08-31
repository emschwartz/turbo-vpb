use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use std::{error::Error, net::SocketAddr};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::info;

mod api;
mod pages;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Serve static files
    let static_file_service = get_service(ServeDir::new("static"))
        .fallback(get_service(ServeFile::new("static/favicons/favicon.ico")))
        .handle_error(internal_service_error);

    let app = api::router()
        .merge(pages::router())
        .fallback(static_file_service)
        .layer(TraceLayer::new_for_http());

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
