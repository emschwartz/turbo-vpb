FROM rust:1.63 as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM debian:buster-slim

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static
CMD ["/usr/app/turbovpb-server"]
