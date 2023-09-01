use crate::metrics::{CHANNEL_DURATION, CONCURRENT_CHANNELS, TOTAL_CHANNELS, TOTAL_MESSAGES};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Extension, Path};
use axum::routing::{delete, get};
use axum::{body::Bytes, http::StatusCode, response::IntoResponse, Json, Router};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast::{channel, Sender};
use tokio::{select, sync::Mutex, time::sleep};
use tracing::{debug, instrument, trace};

const PING_INTERVAL: Duration = Duration::from_secs(20);
const CHANNEL_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60 * 30);
const CHANNEL_CAPACITY: usize = 1;

type ChannelState = Arc<DashMap<String, Channel>>;
struct Channel {
    extension: Sender<Message>,
    browser: Sender<Message>,
    /// Keep track of the number of open channel so we can drop the
    /// channel record when the last connection is dropped.
    num_connections: usize,
    channel_created_at: std::time::Instant,
    // Version <=0.9.6 of the extension expects the server to store
    // the last message sent on either side, because that was the
    // behavior of the nchan server, so we're doing that here
    // for backwards compatibility.
    last_extension_message: Arc<Mutex<Option<Message>>>,
    last_browser_message: Arc<Mutex<Option<Message>>>,
}

impl Default for Channel {
    fn default() -> Self {
        Self {
            extension: channel(CHANNEL_CAPACITY).0,
            browser: channel(CHANNEL_CAPACITY).0,
            num_connections: 0,
            channel_created_at: Instant::now(),
            last_browser_message: Default::default(),
            last_extension_message: Default::default(),
        }
    }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Identity {
    Extension,
    Browser,
}

impl Identity {
    fn as_str(self) -> &'static str {
        match self {
            Identity::Extension => "extension",
            Identity::Browser => "browser",
        }
    }
}

#[derive(Serialize)]
struct Status {
    status: &'static str,
}

pub fn router() -> Router {
    Router::new()
        .route(
            "/api/status",
            get(|| async { Json(Status { status: "ok" }) }),
        )
        .route(
            "/api/channels/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route(
            "/c/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route("/api/channels/:channel_id", delete(delete_channel))
        .layer(Extension(ChannelState::default()))
}

async fn ws_handler(
    Path((channel_id, identity)): Path<(String, Identity)>,
    ws: WebSocketUpgrade,
    Extension(state): Extension<ChannelState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |ws| websocket(channel_id, identity, ws, state.clone()))
}

#[instrument(skip(ws, state))]
async fn websocket(channel_id: String, identity: Identity, ws: WebSocket, state: ChannelState) {
    debug!("websocket connected");

    // Create the channel if it does not already exist
    let (sender, mut receiver, last_message) = {
        let mut channel = state.entry(channel_id.clone()).or_insert_with(|| {
            TOTAL_CHANNELS.with_label_values(&[identity.as_str()]).inc();
            CONCURRENT_CHANNELS
                .with_label_values(&[identity.as_str()])
                .inc();

            Channel::default()
        });
        channel.num_connections += 1;

        match identity {
            Identity::Extension => (
                channel.browser.clone(),
                channel.extension.subscribe(),
                channel.last_browser_message.clone(),
            ),
            Identity::Browser => (
                channel.extension.clone(),
                channel.browser.subscribe(),
                channel.last_extension_message.clone(),
            ),
        }
    };

    let (mut ws_sink, mut ws_stream) = ws.split();

    // If the channel already exists, send the last message that was sent from the other side
    if let Some(message) = last_message.lock().await.clone() {
        match ws_sink.send(message).await {
            Ok(_) => trace!("sent stored message"),
            Err(err) => debug!("error sending stored message to websocket: {err}"),
        }
    }

    // Handle websocket messages
    let mut last_activity = Instant::now();
    loop {
        select! {
            biased;

            // Send outgoing messages
            outgoing = receiver.recv() => {
                if let Ok(message) = outgoing {
                    // Store the last message sent on either side for backwards compatibility
                    let last_message = match identity {
                        Identity::Extension => state.get(&channel_id).unwrap().last_browser_message.clone(),
                        Identity::Browser => state.get(&channel_id).unwrap().last_extension_message.clone(),
                    };
                    *last_message.lock().await = Some(message.clone());

                    match ws_sink.send(message).await {
                        Ok(_) => {
                            last_activity = Instant::now();
                            trace!("sent message");
                            TOTAL_MESSAGES.with_label_values(&[identity.as_str()]).inc();
                        },
                        Err(err) => debug!("error sending message to websocket: {err}"),
                    }
                } else {
                    break;
                }
            }
            // Handle incoming messages
            incoming = ws_stream.next() => {
                let message = match incoming {
                    Some(Ok(message)) => message,
                    Some(Err(err)) => {
                        debug!("error receiving message from websocket: {err}");
                        break;
                    }
                    None => break,
                };

                last_activity = Instant::now();

                match message {
                    Message::Binary(_) => {
                        // Ignore send errors because that just means that the other side is not connected
                        match sender.send(message) {
                            Ok(_) => {
                                trace!("sent message");
                            },
                            Err(err) => debug!("error sending message to channel: {err}"),
                        }
                    }
                    Message::Ping(_) => {
                        sender.send(Message::Pong(Vec::new())).ok();
                    }
                    _ => {}
                }
            }
            // Send a ping if no outgoing message has been sent before the timeout
            _ = sleep(PING_INTERVAL) => {
                if ws_sink.send(Message::Ping(Vec::new())).await.is_err() {
                    break;
                }
            }
            // Timeout channels that have been inactive for too long
            _ = sleep(CHANNEL_INACTIVITY_TIMEOUT - (Instant::now().duration_since(last_activity))) => {
                debug!("channel timed out after {CHANNEL_INACTIVITY_TIMEOUT:?} seconds of inactivity");
                break;
            }
        }
    }

    debug!("websocket closed");

    // Remove the channel record when the last connection is dropped
    let num_channel = {
        let mut channel = state.get_mut(&channel_id).unwrap();
        channel.num_connections -= 1;
        channel.num_connections
    };
    if num_channel == 0 {
        debug!("removing channel");
        if let Some((_, channel)) = state.remove(&channel_id) {
            CONCURRENT_CHANNELS
                .with_label_values(&[identity.as_str()])
                .dec();
            CHANNEL_DURATION
                .with_label_values(&[&identity.as_str()])
                .observe(channel.channel_created_at.elapsed().as_secs_f64());
        }
    }
}

#[instrument(skip(state))]
async fn delete_channel(
    Path(channel_id): Path<String>,
    Extension(state): Extension<ChannelState>,
) -> impl IntoResponse {
    debug!("deleting channel");
    state.remove(&channel_id);
}

#[instrument(skip(state, body))]
async fn post_channel(
    Path((channel_id, identity)): Path<(String, Identity)>,
    Extension(state): Extension<ChannelState>,
    body: Bytes,
) -> impl IntoResponse {
    if let Some(channel) = state.get(&channel_id) {
        let channel = match identity {
            Identity::Extension => channel.browser.clone(),
            Identity::Browser => channel.extension.clone(),
        };

        match channel.send(Message::Binary(body.into())) {
            Ok(_) => {
                trace!("forwarding HTTP message to websocket");
                (StatusCode::OK, "")
            }
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
