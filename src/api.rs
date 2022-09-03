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
use tracing::{debug, instrument, trace, Instrument};

const PING_INTERVAL: Duration = Duration::from_secs(20);
const CHANNEL_CAPACITY: usize = 1;

type State = Arc<DashMap<String, Channel>>;
struct Channel {
    extension: Sender<Message>,
    browser: Sender<Message>,
    /// Keep track of the number of open channel so we can drop the
    /// channel record when the last connection is dropped.
    num_connections: usize,
    /// We store the first message sent by the extension for backwards compatibility.
    /// The extension sends a connect message, which was previously stored by the
    /// nchan server. Without it, when the website connects, it expects to get a
    /// connect message but never does, so it never thinks it's connected.
    extension_first_message: Option<Message>,
}

impl Default for Channel {
    fn default() -> Self {
        Self {
            extension: channel(CHANNEL_CAPACITY).0,
            browser: channel(CHANNEL_CAPACITY).0,
            num_connections: 0,
            extension_first_message: None,
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

    // If this is the browser, send the stored first message from the extension
    if identity == Identity::Browser {
        if let Some(message) = state
            .get(&channel_id)
            .and_then(|channel| channel.extension_first_message.clone())
        {
            trace!("sending first message to browser");
            ws_sink.send(message).await.unwrap();
        }
    }

    // Forward outgoing messages and send pings
    let mut send_task = tokio::spawn(
        async move {
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
        }
        .in_current_span(),
    );

    // Forward incoming messages
    let state_clone = state.clone();
    let channel_id_clone = channel_id.clone();
    let mut receive_task = tokio::spawn(
        async move {
            while let Some(Ok(message)) = ws_stream.next().await {
                match message {
                    Message::Binary(_) => {
                        // Store the first message from the extension for backwards compatibility
                        if identity == Identity::Extension
                            && state_clone
                                .get(&channel_id_clone)
                                .map(|c| c.extension_first_message.is_none())
                                == Some(true)
                        {
                            if let Some(mut channel) = state_clone.get_mut(&channel_id_clone) {
                                trace!("storing first extension message");
                                channel.extension_first_message = Some(message.clone());
                            }
                        }

                        // Ignore send errors because that just means that the other side is not connected
                        if let Err(err) = sender.send(message) {
                            debug!("error sending message to channel: {err}");
                        }
                    }
                    // This is only for testing purposes
                    Message::Text(message) => {
                        if let Err(err) = sender.send(Message::Binary(message.into_bytes())) {
                            debug!("error sending message to channel: {err}");
                        }
                    }
                    Message::Ping(_) => {
                        sender.send(Message::Pong(Vec::new())).ok();
                    }
                    _ => {}
                }
            }
        }
        .in_current_span(),
    );

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
