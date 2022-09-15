FROM rust:1.63 as builder

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

FROM debian:buster-slim

# Set the working directory so the server can find the static files
WORKDIR /usr/app

# Install the root certificates
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/turbovpb-server /usr/app/turbovpb-server
COPY ./static/ /usr/app/static/

EXPOSE 8080
EXPOSE 8081

CMD ["/usr/app/turbovpb-server"]
