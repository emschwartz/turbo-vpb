use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::{Extension, Path};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, get_service};
use axum::{Router, Server};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use handlebars::{no_escape, Handlebars};
use serde::{Deserialize, Serialize};
use std::path::Path as FilePath;
use std::{error::Error, net::SocketAddr, sync::Arc, time::Duration};
use tokio::fs::read_to_string;
use tokio::select;
use tokio::sync::broadcast::{channel, Sender};
use tokio::time::sleep;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{debug, info};

const PING_INTERVAL: Duration = Duration::from_secs(20);
const PAGES: &[&str] = &["index", "connect", "share"];

type State = Arc<DashMap<String, Channel>>;
struct Channel {
    extension: Sender<Message>,
    website: Sender<Message>,
    /// Keep track of the number of open channel so we can drop the
    /// channel record when the last connection is dropped.
    num_connections: usize,
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Identity {
    Extension,
    Website,
}

#[derive(Serialize)]
struct TemplateParams {
    content: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let root_dir = FilePath::new(env!("CARGO_MANIFEST_DIR"));
    let src_dir = root_dir.join("src");
    let static_dir = src_dir.join("static");
    let favicon_dir = static_dir.join("favicons");

    let static_file_service = get_service(ServeDir::new(static_dir))
        .fallback(get_service(ServeFile::new(favicon_dir.join("favicon.ico"))))
        .handle_error(internal_service_error);

    // Render pages
    let app = api_router()
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

fn api_router() -> Router {
    let state: State = Default::default();

    Router::new()
        .route(
            "/health",
            get(|| async { "Hello, I am the TurboVPB server\n" }),
        )
        .route(
            "/c/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route("/c/:channel_id", delete(delete_channel))
        .layer(Extension(state))
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

async fn ws_handler(
    Path((channel_id, identity)): Path<(String, Identity)>,
    ws: WebSocketUpgrade,
    state: Extension<State>,
) -> impl IntoResponse {
    debug!("channel {} {:?} connected", channel_id, identity);
    ws.on_upgrade(move |ws| async move {
        let mut channel = state.entry(channel_id.clone()).or_insert_with(|| Channel {
            extension: channel(1).0,
            website: channel(1).0,
            num_connections: 0,
        });
        channel.num_connections += 1;

        let (sender, mut receiver) = match identity {
            Identity::Extension => (channel.website.clone(), channel.extension.subscribe()),
            Identity::Website => (channel.extension.clone(), channel.website.subscribe()),
        };
        drop(channel);

        let (mut ws_sink, mut ws_stream) = ws.split();

        // Forward outgoing messages and send pings
        let mut send_task = tokio::spawn(async move {
            loop {
                select! {
                    message = receiver.recv() => {
                        match message {
                            Ok(message) => if ws_sink.send(message).await.is_err() {
                                return;
                            }
                            Err(_) => break
                        }
                    }
                    // Send a ping if no outgoing message has been sent before the timeout
                    _ = sleep(PING_INTERVAL) => {
                        if ws_sink.send(Message::Ping(Vec::new())).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // Forward incoming messages
        let mut receive_task = tokio::spawn(async move {
            while let Some(Ok(message)) = ws_stream.next().await {
                match message {
                    Message::Binary(message) => {
                        // Ignore send errors because that just means that the other side is not connected
                        sender.send(Message::Binary(message)).ok();
                    }
                    // This is only for testing purposes
                    Message::Text(message) => {
                        sender.send(Message::Binary(message.into_bytes())).ok();
                    }
                    Message::Ping(_) => {
                        sender.send(Message::Pong(Vec::new())).ok();
                    }
                    _ => {}
                }
            }
        });

        // If any one of the tasks exit, abort the other.
        select! {
            _ = (&mut send_task) => receive_task.abort(),
            _ = (&mut receive_task) => send_task.abort(),
            // TODO timeout channels
        };

        // Remove the channel record when the last connection is dropped
        let num_channel = {
            let mut channel = state.get_mut(&channel_id).unwrap();
            channel.num_connections -= 1;
            channel.num_connections
        };
        if num_channel == 0 {
            state.remove(&channel_id);
        }
    })
}

async fn delete_channel(
    Path(channel_id): Path<String>,
    state: Extension<State>,
) -> impl IntoResponse {
    state.remove(&channel_id);
}

async fn post_channel(
    Path((channel_id, identity)): Path<(String, Identity)>,
    state: Extension<State>,
    body: Bytes,
) -> impl IntoResponse {
    if let Some(channel) = state.get(&channel_id) {
        let channel = match identity {
            Identity::Extension => channel.website.clone(),
            Identity::Website => channel.extension.clone(),
        };
        // TODO return error
        // TODO don't copy the message if possible
        channel.send(Message::Binary(body.to_vec())).ok();
    }
}
