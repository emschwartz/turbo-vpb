use axum::{routing::get, Router};
use once_cell::sync::Lazy;
use prometheus::{
    register_gauge_vec, register_histogram_vec, register_int_counter_vec, Encoder, GaugeVec,
    HistogramVec, IntCounterVec, TextEncoder,
};

pub static CONCURRENT_CHANNELS: Lazy<GaugeVec> = Lazy::new(|| {
    register_gauge_vec!(
        "channels_concurrent",
        "Number of concurrent channels",
        &["identity"]
    )
    .unwrap()
});
pub static TOTAL_MESSAGES: Lazy<IntCounterVec> = Lazy::new(|| {
    register_int_counter_vec!("messages_total", "Total messages sent", &["identity"]).unwrap()
});
pub static TOTAL_CHANNELS: Lazy<IntCounterVec> = Lazy::new(|| {
    register_int_counter_vec!("channels_total", "Total number of channels", &["identity"]).unwrap()
});
pub static CHANNEL_DURATION: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!("channels_duration", "Duration of channels", &["identity"],).unwrap()
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
