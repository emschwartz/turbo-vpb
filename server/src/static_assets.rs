use axum::{
    body::Body,
    http::{header, Request, Response, StatusCode},
};
use rust_embed::Embed;
use std::task::{Context, Poll};
use tower::Service;

#[derive(Embed)]
#[folder = "static/"]
struct Assets;

fn mime_from_path(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("css") => "text/css",
        Some("js") => "text/javascript",
        Some("html") => "text/html",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("xml") => "application/xml",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Serve embedded static assets, falling back to favicon.ico for unknown paths.
pub fn service() -> StaticAssetService {
    StaticAssetService
}

#[derive(Clone)]
pub struct StaticAssetService;

impl Service<Request<Body>> for StaticAssetService {
    type Response = Response<Body>;
    type Error = std::convert::Infallible;
    type Future = std::future::Ready<Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let path = req.uri().path().trim_start_matches('/');

        let response = if let Some(file) = Assets::get(path) {
            Response::builder()
                .header(header::CONTENT_TYPE, mime_from_path(path))
                .body(Body::from(file.data))
                .unwrap()
        } else if let Some(favicon) = Assets::get("favicons/favicon.ico") {
            Response::builder()
                .header(header::CONTENT_TYPE, "image/x-icon")
                .body(Body::from(favicon.data))
                .unwrap()
        } else {
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not Found"))
                .unwrap()
        };

        std::future::ready(Ok(response))
    }
}
