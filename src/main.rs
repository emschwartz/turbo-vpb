use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, get_service};
use axum::{Router, Server};
use handlebars::{no_escape, Handlebars};
use serde::Serialize;
use std::path::Path as FilePath;
use std::{error::Error, net::SocketAddr};
use tokio::fs::read_to_string;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::info;

mod api;

const PAGES: &[&str] = &["index", "connect", "share"];

#[derive(Serialize)]
struct TemplateParams {
    content: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let root_dir = FilePath::new(env!("CARGO_MANIFEST_DIR"));
    let static_dir = root_dir.join("src/static");
    let favicon_dir = static_dir.join("favicons");

    let static_file_service = get_service(ServeDir::new(static_dir))
        .fallback(get_service(ServeFile::new(favicon_dir.join("favicon.ico"))))
        .handle_error(internal_service_error);

    // Render pages
    let app = api::router()
        .merge(pages_router().await)
        .fallback(static_file_service)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("listening on {}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn pages_router() -> Router {
    let root_dir = FilePath::new(env!("CARGO_MANIFEST_DIR"));
    let src_dir = root_dir.join("src");
    let pages_dir = src_dir.join("pages");

    // Load template
    let mut templates = Handlebars::new();
    // Don't escape HTML because we are specifically using this to embed the page content as HTML in the template
    templates.register_escape_fn(no_escape);
    templates
        .register_template_file("template", src_dir.join("template.hbs"))
        .expect("Error parsing template");

    let mut router = Router::new();

    // Render each of the pages and add them as routes
    for page in PAGES {
        let path = pages_dir.join(format!("{}.html", page));
        let content = read_to_string(path)
            .await
            .expect(&format!("Error reading page {}", page));
        let content = templates
            .render("template", &TemplateParams { content })
            .expect(&format!("Error rendering page {}", page));
        let service = get(move || async move { Html(content) });
        if *page == "index" {
            router = router.route("/", service.clone());
        }
        router = router
            .route(&format!("/{}", page), service.clone())
            .route(&format!("/{}.html", page), service);
    }

    router
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
