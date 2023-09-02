FROM rust:1.72-bookworm as builder

WORKDIR /usr/src/app

# Build the server
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim

# Install the root certificates
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory so the server can find the static files
WORKDIR /usr/app

COPY --from=builder /usr/src/app/target/release/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static/

CMD /usr/app/turbovpb-server
