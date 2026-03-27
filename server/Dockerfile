FROM rust:1.94-bookworm AS builder

WORKDIR /usr/src/app

# Cache dependency builds by first compiling with a dummy main
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Build the actual server
COPY src src
COPY content content
COPY templates templates
RUN cargo build --release

# Build Tailwind CSS
FROM debian:bookworm-slim AS css
ARG TAILWIND_VERSION=4.2.2
WORKDIR /usr/src/app
ADD https://github.com/tailwindlabs/tailwindcss/releases/download/v${TAILWIND_VERSION}/tailwindcss-linux-x64 /usr/local/bin/tailwindcss
RUN chmod +x /usr/local/bin/tailwindcss
COPY styles styles
COPY content content
COPY templates templates
COPY static/js static/js
RUN tailwindcss -i styles/input.css -o static/styles.css --minify

FROM debian:bookworm-slim

# Install the root certificates
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory so the server can find the static files
WORKDIR /usr/app

COPY --from=builder /usr/src/app/target/release/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static/
COPY --from=css /usr/src/app/static/styles.css /usr/app/static/styles.css

CMD ["/usr/app/turbovpb-server"]
