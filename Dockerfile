FROM rust:1.63 as builder

WORKDIR /usr/src/app

# Build the server
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/src/app/target \
    cargo build --release
RUN --mount=type=cache,target=/usr/src/app/target \
    cp /usr/src/app/target/release/turbovpb-server /usr/src/app/turbovpb-server

FROM debian:buster-slim

# Set the working directory so the server can find the static files
WORKDIR /usr/app

# Install the root certificates
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static

CMD ["/usr/app/turbovpb-server"]
