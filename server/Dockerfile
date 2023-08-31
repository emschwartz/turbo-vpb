FROM rust:1.72-bookworm as builder

WORKDIR /usr/src/app

# Build the dependencies first
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/src/app/target \
    cargo build --release
RUN rm src/*.rs

# Build the server
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/src/app/target \
    cargo build --release
RUN --mount=type=cache,target=/usr/src/app/target \
    cp /usr/src/app/target/release/turbovpb-server /usr/src/app/turbovpb-server

FROM debian:bookworm-slim

# Install the root certificates
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory so the server can find the static files
WORKDIR /usr/app

COPY --from=builder /usr/src/app/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static/

CMD /usr/app/turbovpb-server
