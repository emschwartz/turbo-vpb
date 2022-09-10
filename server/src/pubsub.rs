use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Extension, Path};
use axum::routing::{delete, get};
use axum::{body::Bytes, http::StatusCode, response::IntoResponse, Json, Router};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast::{channel, Sender};
use tokio::{select, time::sleep};
use tracing::{debug, instrument, trace};

const PING_INTERVAL: Duration = Duration::from_secs(20);
const CHANNEL_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60 * 30);
const CHANNEL_CAPACITY: usize = 1;

type State = Arc<DashMap<String, Channel>>;
struct Channel {
    extension: Sender<Message>,
    browser: Sender<Message>,
    /// Keep track of the number of open channel so we can drop the
    /// channel record when the last connection is dropped.
    num_connections: usize,
    /// We store the last message sent by the extension for backwards compatibility.
    extension_last_message: Option<Message>,
}

impl Default for Channel {
    fn default() -> Self {
        Self {
            extension: channel(CHANNEL_CAPACITY).0,
            browser: channel(CHANNEL_CAPACITY).0,
            num_connections: 0,
            extension_last_message: None,
        }
    }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Identity {
    Extension,
    Browser,
}

#[derive(Serialize)]
struct Status {
    status: &'static str,
}

pub fn router() -> Router {
    let state: State = Default::default();

    Router::new()
        .route(
            "/api/status",
            get(|| async { Json(Status { status: "ok" }) }),
        )
        .route(
            "/api/channels/:channel_id/:identity",
            get(ws_handler).post(post_channel),
        )
        .route("/api/channels/:channel_id", delete(delete_channel))
        .layer(Extension(state))
}

async fn ws_handler(
    Path((channel_id, identity)): Path<(String, Identity)>,
    ws: WebSocketUpgrade,
    Extension(state): Extension<State>,
) -> impl IntoResponse {
    ws.on_upgrade(move |ws| websocket(channel_id, identity, ws, state.clone()))
}

#[instrument(skip(ws, state))]
async fn websocket(channel_id: String, identity: Identity, ws: WebSocket, state: State) {
    debug!("websocket connected");

    // Create the channel if it does not already exist
    let mut channel = state.entry(channel_id.clone()).or_default();
    channel.num_connections += 1;

    let (sender, mut receiver) = match identity {
        Identity::Extension => (channel.browser.clone(), channel.extension.subscribe()),
        Identity::Browser => (channel.extension.clone(), channel.browser.subscribe()),
    };
    drop(channel);

    let (mut ws_sink, mut ws_stream) = ws.split();

    // Send the browser the last message we got from the extension
    if identity == Identity::Browser {
        if let Some(message) = state
            .get(&channel_id)
            .and_then(|channel| channel.extension_last_message.clone())
        {
            if let Err(err) = ws_sink.send(message).await {
                debug!("error sending message to websocket: {err}");
            }
        }
    }

    // Handle websocket messages
    let mut timeout = Some(sleep(CHANNEL_INACTIVITY_TIMEOUT));
    loop {
        select! {
            biased;

            // Send outgoing messages
            outgoing = receiver.recv() => {
                if let Ok(message) = outgoing {
                    match ws_sink.send(message).await {
                        Ok(_) => {
                            // Update the inactivity timer
                            timeout = Some(sleep(CHANNEL_INACTIVITY_TIMEOUT));
                            trace!("sent message");
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

                // Update the inactivity timer
                timeout = Some(sleep(CHANNEL_INACTIVITY_TIMEOUT));

                match message {
                    Message::Binary(_) => {
                        // Store the last message from the extension for backwards compatibility
                        if identity == Identity::Extension {
                            if let Some(mut channel) = state.get_mut(&channel_id) {
                                channel.extension_last_message = Some(message.clone());
                            }
                        }

                        // Ignore send errors because that just means that the other side is not connected
                        match sender.send(message) {
                            Ok(_) => trace!("sent message"),
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
            _ = timeout.take().unwrap_or(sleep(CHANNEL_INACTIVITY_TIMEOUT)) => {
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
        state.remove(&channel_id);
    }
}

#[instrument(skip(state))]
async fn delete_channel(
    Path(channel_id): Path<String>,
    state: Extension<State>,
) -> impl IntoResponse {
    debug!("deleting channel");
    state.remove(&channel_id);
}

#[instrument(skip(state, body))]
async fn post_channel(
    Path((channel_id, identity)): Path<(String, Identity)>,
    state: Extension<State>,
    body: Bytes,
) -> impl IntoResponse {
    if let Some(channel) = state.get(&channel_id) {
        let channel = match identity {
            Identity::Extension => channel.browser.clone(),
            Identity::Browser => channel.extension.clone(),
        };

        match channel.send(Message::Binary(body.to_vec())) {
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
