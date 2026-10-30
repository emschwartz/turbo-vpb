use axum::{
    http::{header, HeaderValue},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Serialize;
use tinytemplate::{format_unescaped, TinyTemplate};

/// The connect page decrypts the volunteer's contacts with the key in its URL
/// fragment, so a script that got into it would see every contact and could
/// act as the phone. It only loads its own scripts, so nothing but those may
/// run: no inline or third-party script, no plugins, no framing. The page's
/// `<style>` block needs inline styles, and its WebSocket goes to the server
/// the page came from (`'self'` covers ws/wss on current browsers, and the
/// explicit schemes cover older mobile ones).
const CONNECT_CSP: &str = "default-src 'self'; \
    script-src 'self'; \
    style-src 'self' 'unsafe-inline'; \
    img-src 'self' data:; \
    connect-src 'self' ws: wss:; \
    object-src 'none'; \
    base-uri 'none'; \
    frame-ancestors 'none'; \
    form-action 'none'";

const PAGES: &[(&str, &str)] = &[
    ("index", include_str!("../content/index.html")),
    ("connect", include_str!("../content/connect.html")),
    ("share", include_str!("../content/share.html")),
    (
        "test-phonebank",
        include_str!("../content/test-phonebank.html"),
    ),
    (
        "test-van-custom-domain",
        include_str!("../content/test-van-custom-domain.html"),
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
            .unwrap_or_else(|_| panic!("Error rendering page {}", page));
        let csp = (*page == "connect").then(|| HeaderValue::from_static(CONNECT_CSP));
        let service = get(move || async move {
            match csp {
                Some(csp) => {
                    ([(header::CONTENT_SECURITY_POLICY, csp)], Html(content)).into_response()
                }
                None => Html(content).into_response(),
            }
        });
        if *page == "index" {
            router = router.route("/", service.clone());
        }
        router = router
            .route(&format!("/{}", page), service.clone())
            .route(&format!("/{}.html", page), service);
    }

    router
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn csp_of(path: &str) -> Option<String> {
        let response = router()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{path}");
        response
            .headers()
            .get(header::CONTENT_SECURITY_POLICY)
            .map(|v| v.to_str().unwrap().to_string())
    }

    #[tokio::test]
    async fn connect_page_only_runs_its_own_scripts() {
        for path in ["/connect", "/connect.html"] {
            let csp = csp_of(path).await.expect("connect page has a CSP");
            let directives: Vec<&str> = csp.split("; ").collect();
            assert!(directives.contains(&"script-src 'self'"), "{csp}");
            assert!(directives.contains(&"object-src 'none'"), "{csp}");
            assert!(directives.contains(&"frame-ancestors 'none'"), "{csp}");
        }
    }

    #[tokio::test]
    async fn other_pages_keep_their_inline_scripts() {
        // The share and test pages have inline scripts, which this CSP
        // would block
        for path in ["/", "/share", "/test-phonebank"] {
            assert_eq!(csp_of(path).await, None, "{path}");
        }
    }
}
