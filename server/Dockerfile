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

# Build client-side TypeScript
FROM node:22-bookworm-slim AS js
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY build.mjs tsconfig.json ./
COPY src-js src-js
RUN pnpm run build

# Build Tailwind CSS
FROM debian:bookworm-slim AS css
ARG TAILWIND_VERSION=4.2.2
WORKDIR /usr/src/app
ADD https://github.com/tailwindlabs/tailwindcss/releases/download/v${TAILWIND_VERSION}/tailwindcss-linux-x64 /usr/local/bin/tailwindcss
# Verify binary integrity (update hash when bumping TAILWIND_VERSION)
RUN echo "4ab84f2b496c402d3ec4fd25e0e5559fe1184d886dadae8fb4438344ec044c22  /usr/local/bin/tailwindcss" | sha256sum -c - \
    && chmod +x /usr/local/bin/tailwindcss
COPY styles styles
COPY content content
COPY templates templates
RUN tailwindcss -i styles/input.css -o static/styles.css --minify

FROM debian:bookworm-slim

# Set the working directory so the server can find the static files
WORKDIR /usr/app

RUN mkdir -p /data

COPY --from=builder /usr/src/app/target/release/turbovpb-server /usr/app/turbovpb-server
COPY static /usr/app/static/
COPY --from=js /usr/src/app/static/js /usr/app/static/js/
COPY --from=css /usr/src/app/static/styles.css /usr/app/static/styles.css

CMD ["/usr/app/turbovpb-server"]
