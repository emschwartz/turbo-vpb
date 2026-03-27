use axum::{http::StatusCode, response::IntoResponse, routing::get_service, Server};
use futures::try_join;
use std::{env, error::Error, net::SocketAddr, path::PathBuf};
use tokio::fs;
use tokio_rusqlite::{rusqlite, Connection};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing::{debug, info};

mod metrics;
mod pages;
mod pubsub;
mod stats;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    info!("Starting TurboVPB server");

    // Make sure we can access the static file directory
    let static_dir: PathBuf = env::args().nth(1).unwrap_or_else(|| "static".to_string()).into();
    fs::read_dir(&static_dir)
        .await
        .expect("Failed to read static directory")
        .next_entry()
        .await
        .expect("Failed to read file from static directory");
    debug!("Using static directory: {}", static_dir.display());

    // Serve static files
    let static_file_service = get_service(ServeDir::new(&static_dir))
        .fallback(get_service(ServeFile::new(static_dir.join("favicons/favicon.ico"))))
        .handle_error(internal_service_error);

    let website = pages::router()
        .fallback(static_file_service)
        .layer(CompressionLayer::new());

    // Initialize SQLite database
    let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "data/turbovpb.db".to_string());
    let db_dir = PathBuf::from(&db_path);
    if let Some(parent) = db_dir.parent() {
        fs::create_dir_all(parent)
            .await
            .expect("Failed to create database directory");
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

    let api = pubsub::router().merge(stats::router(db));

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Listening on {}", addr);
    let app = api.merge(website).layer(TraceLayer::new_for_http());
    let app = Server::bind(&addr).serve(app.into_make_service());

    // Serve the metrics on a different port so they're not publicly exposed
    let metrics_addr = SocketAddr::from(([0, 0, 0, 0], 8081));
    let metrics = Server::bind(&metrics_addr).serve(metrics::router().into_make_service());
    info!("Metrics listening on {}", metrics_addr);

    try_join!(app, metrics).expect("Server error");
}

async fn internal_service_error(_: impl Error) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}
