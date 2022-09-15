use axum::{routing::get, Router};
use once_cell::sync::Lazy;
use prometheus::{
    register_gauge, register_histogram_vec, register_int_counter, register_int_counter_vec,
    Encoder, Gauge, HistogramVec, IntCounter, IntCounterVec, TextEncoder,
};

pub static CONCURRENT_CHANNELS: Lazy<Gauge> =
    Lazy::new(|| register_gauge!("concurrent_channels", "Number of concurrent channels").unwrap());
pub static MESSAGES_PER_CHANNEL: Lazy<IntCounterVec> = Lazy::new(|| {
    register_int_counter_vec!(
        "messages_per_channel",
        "Number of messages per channel",
        &["channel"]
    )
    .unwrap()
});
pub static TOTAL_CHANNELS: Lazy<IntCounter> =
    Lazy::new(|| register_int_counter!("total_channels", "Total number of channels").unwrap());
pub static CHANNEL_DURATION: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!("channel_duration", "Duration of channels", &["channel"],).unwrap()
});

pub fn router() -> Router {
    Router::new().route("/metrics", get(prometheus_exporter))
}

pub async fn prometheus_exporter() -> String {
    let encoder = TextEncoder::new();
    let mut buffer = vec![];
    let metric_families = prometheus::gather();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}
