use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::{Extension, Path};
use axum::response::IntoResponse;
use axum::routing::{delete, get};
use axum::{Router, Server};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::{net::SocketAddr, sync::Arc};
use tokio::select;
use tokio::sync::broadcast::{channel, Sender};
use tracing::{debug, info};

type State = Arc<DashMap<String, Connections>>;
struct Connections {
    extension: Sender<Message>,
    website: Sender<Message>,
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Identity {
    Extension,
    Website,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let state: State = Default::default();

    let app = Router::new()
        .route("/", get(|| async { "Hello, I am the TurboVPB server\n" }))
        .route(
            "/c/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route("/c/:channel_id", delete(delete_channel))
        .layer(Extension(state));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    info!("listening on {}", addr);
    Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn ws_handler(
    Path((channel_id, identity)): Path<(String, Identity)>,
    ws: WebSocketUpgrade,
    state: Extension<State>,
) -> impl IntoResponse {
    debug!("channel {} {:?} connected", channel_id, identity);
    ws.on_upgrade(move |ws| async move {
        let connections = state.entry(channel_id).or_insert_with(|| Connections {
            extension: channel(1).0,
            website: channel(1).0,
        });

        let (sender, mut receiver) = match identity {
            Identity::Extension => (
                connections.website.clone(),
                connections.extension.subscribe(),
            ),
            Identity::Website => (
                connections.extension.clone(),
                connections.website.subscribe(),
            ),
        };
        drop(connections);

        let (mut ws_sink, mut ws_stream) = ws.split();

        // Forward outgoing messages
        let mut send_task = tokio::spawn(async move {
            while let Ok(message) = receiver.recv().await {
                if ws_sink.send(message).await.is_err() {
                    break;
                };
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
    if let Some(connections) = state.get(&channel_id) {
        let channel = match identity {
            Identity::Extension => connections.website.clone(),
            Identity::Website => connections.extension.clone(),
        };
        // TODO return error
        // TODO don't copy the message if possible
        channel.send(Message::Binary(body.to_vec())).ok();
    }
}
