FROM rust:1.63 as builder

# Make a fake Rust app to keep a cached layer of compiled crates
RUN USER=root cargo new app
WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock ./
# Needs at least a main.rs file with a main function
RUN mkdir src && echo "fn main(){}" > src/main.rs
# Will build all dependent crates in release mode
RUN cargo build --release

# Copy the rest
COPY . .
RUN cargo build --release
RUN strip -s target/release/turbovpb-server

# Runtime image
FROM debian:bullseye-slim

# Run as "app" user
RUN useradd -ms /bin/bash app

USER app
WORKDIR /app

# Get compiled binaries from builder's cargo install directory
COPY --from=builder /usr/src/app/target/release/turbovpb-server /app/turbovpb-server
COPY --from=builder /usr/src/app/static /app/static

EXPOSE 8080

CMD ["/app/turbovpb-server"]
