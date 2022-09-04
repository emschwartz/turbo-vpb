use axum::{response::Html, routing::get, Router};
use serde::Serialize;
use tinytemplate::{format_unescaped, TinyTemplate};

const PAGES: &[(&str, &str)] = &[
    ("index", include_str!("../content/index.html")),
    ("connect", include_str!("../content/connect.html")),
    ("share", include_str!("../content/share.html")),
    (
        "test-phonebank",
        include_str!("../content/test-phonebank.html"),
    ),
];
static TEMPLATE: &str = include_str!("../templates/default.html");

#[derive(Serialize)]
struct TemplateParams {
    content: &'static str,
}

pub fn router() -> Router {
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
