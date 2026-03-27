use axum::extract::DefaultBodyLimit;
use std::{env, net::SocketAddr};
use tokio_rusqlite::{rusqlite, Connection};
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing::info;

mod metrics;
mod pages;
mod pubsub;
mod static_assets;
mod stats;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    info!("Starting TurboVPB server");

    let website = pages::router()
        .fallback_service(static_assets::service())
        .layer(CompressionLayer::new());

    // Initialize SQLite database
    let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "data/turbovpb.db".to_string());
    let db_dir = std::path::Path::new(&db_path);
    if let Some(parent) = db_dir.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create database directory");
    }
    let db = Connection::open(&db_path)
        .await
        .expect("Failed to open SQLite database");
    db.call(|conn| {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                duration INTEGER NOT NULL,
                result TEXT,
                timestamp TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS texts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );",
        )?;
        Ok::<(), rusqlite::Error>(())
    })
    .await
    .expect("Failed to create database tables");
    info!("SQLite database initialized at {db_path}");

    let api = pubsub::router()
        .merge(stats::router(db))
        .layer(DefaultBodyLimit::max(16_384)); // 16 KB max

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Listening on {}", addr);
    let app = api.merge(website).layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    // Serve the metrics on a different port so they're not publicly exposed
    let metrics_port: u16 = env::var("METRICS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8081);
    let metrics_addr = SocketAddr::from(([127, 0, 0, 1], metrics_port));
    let metrics_listener = tokio::net::TcpListener::bind(metrics_addr)
        .await
        .expect("Failed to bind metrics");
    info!("Metrics listening on {}", metrics_addr);

    let metrics_handle = tokio::spawn(async move {
        axum::serve(metrics_listener, metrics::router().into_make_service())
            .await
            .expect("Metrics server error");
    });

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    metrics_handle.abort();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install CTRL+C handler");
    info!("Shutdown signal received");
}
