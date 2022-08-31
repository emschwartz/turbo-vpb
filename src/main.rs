use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, get_service};
use axum::{Router, Server};
use serde::Serialize;
use std::{env::current_dir, error::Error, net::SocketAddr};
use tinytemplate::{format_unescaped, TinyTemplate};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing::info;

mod api;

const PAGES: &[(&str, &str)] = &[
    ("index", include_str!("../content/index.html")),
    ("connect", include_str!("../content/connect.html")),
    ("share", include_str!("../content/share.html")),
];
static TEMPLATE: &str = include_str!("../templates/default.html");

#[derive(Serialize)]
struct TemplateParams {
    content: &'static str,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let static_dir = current_dir()
        .expect("failed to get current directory")
        .join("static");

    let static_file_service = get_service(ServeDir::new(&static_dir))
        .fallback(get_service(ServeFile::new(static_dir.join("favicon.ico"))))
        .handle_error(internal_service_error);

    // Render pages
    let app = api::router()
        .merge(pages_router())
        .fallback(static_file_service)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("listening on {}", addr);

    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

fn pages_router() -> Router {
    let mut templates = TinyTemplate::new();
    // Don't escape HTML because we are specifically using this to embed the page content as HTML in the template
    templates.set_default_formatter(&format_unescaped);
    templates
        .add_template("template", TEMPLATE)
        .expect("Error parsing template");

    let mut router = Router::new();

    // Render each of the pages and add them as routes
    for (page, content) in PAGES {
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
