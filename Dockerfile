FROM rust:1.63 as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo install --path .
# --mount=type=cache,target=/usr/local/cargo/registry \
    # --mount=type=cache,target=/usr/src/app/target \
    # cargo install --path .

FROM debian:buster-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/cargo/bin/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static
CMD ["/usr/app/turbovpb-server"]
