use axum::extract::ws::{Message, WebSocketUpgrade};
use axum::extract::{Extension, Path};
use axum::routing::{delete, get};
use axum::{body::Bytes, http::StatusCode, response::IntoResponse, Json, Router};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast::{channel, Sender};
use tokio::{select, time::sleep};
use tracing::{debug, info_span, trace, Instrument};

const PING_INTERVAL: Duration = Duration::from_secs(20);

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
struct Status {
    status: &'static str,
}

pub fn router() -> Router {
    let state: State = Default::default();

    Router::new()
        .route("/status", get(|| async { Json(Status { status: "ok" }) }))
        .route(
            "/c/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route("/c/:channel_id", delete(delete_channel))
        .layer(Extension(state))
}

async fn ws_handler(
    Path((channel_id, identity)): Path<(String, Identity)>,
    ws: WebSocketUpgrade,
    state: Extension<State>,
) -> impl IntoResponse {
    let span = info_span!("connection", channel_id, ?identity);

    ws.on_upgrade(move |ws| {
        async move {
            debug!("connected");

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
                            if let Ok(message) = message {
                                match ws_sink.send(message).await {
                                    Ok(_) => trace!("sent message"),
                                    Err(err) => debug!("error sending message to websocket: {err}"),
                                }
                            } else {
                                break;
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

            debug!("websocket closed");

            // Remove the channel record when the last connection is dropped
            let num_channel = {
                let mut channel = state.get_mut(&channel_id).unwrap();
                channel.num_connections -= 1;
                channel.num_connections
            };
            if num_channel == 0 {
                debug!("removing channel");
                state.remove(&channel_id);
            }
        }
        .instrument(span)
    })
}

async fn delete_channel(
    Path(channel_id): Path<String>,
    state: Extension<State>,
) -> impl IntoResponse {
    debug!("deleting channel {channel_id}");
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

        match channel.send(Message::Binary(body.to_vec())) {
            Ok(_) => (StatusCode::OK, ""),
            Err(err) => {
                debug!("Error sending message to websocket: {err}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to send message to peer",
                )
            }
        }
    } else {
        (
            StatusCode::NOT_FOUND,
            "Channel does not exist or has been closed",
        )
    }
}
