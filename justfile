# run the server and extension in dev mode
dev browser='chrome':
    #!/usr/bin/env bash
    set -euxo pipefail
    trap "kill 0" SIGINT
    RUST_LOG=turbovpb_server=trace cargo run --manifest-path server/Cargo.toml &
    cd extension && TARGET={{browser}} pnpm dev &
    wait

# dev with Firefox
df: (dev 'firefox')
# dev with Chrome
dc: (dev 'chrome')

# --- Extension ---

# install extension dependencies
ext-install:
    cd extension && pnpm install

# build extension
ext-build browser='chrome':
    cd extension && TARGET={{browser}} pnpm build

# run extension in dev mode
ext-dev browser='chrome':
    cd extension && TARGET={{browser}} pnpm dev

# package extension into a zip for store submission
ext-package browser='chrome': (ext-build browser)
    (rm extension/turbovpb-{{browser}}.zip || true) && cd extension/dist && zip -r9 ../turbovpb-{{browser}}.zip *

# --- Server ---

# run the server locally
server-run:
    RUST_LOG=turbovpb_server=trace cargo run --manifest-path server/Cargo.toml

# build the server
server-build:
    cargo build --manifest-path server/Cargo.toml

# deploy server to fly.io
server-deploy:
    cd server && fly deploy

# build server docker image
server-docker-build:
    docker build -t turbovpb-server server

# build and run server in docker
server-docker-run: server-docker-build
    docker run -e RUST_LOG=turbovpb_server=trace -p 8080:8080 -p 8081:8081 -it --rm turbovpb-server

# build tailwind css for server pages
server-css:
    cd server && ./tailwindcss -i styles/input.css -o static/styles.css

# watch and rebuild tailwind css for server pages
server-css-watch:
    cd server && ./tailwindcss -i styles/input.css -o static/styles.css --watch

# build minified tailwind css for server pages
server-css-prod:
    cd server && ./tailwindcss -i styles/input.css -o static/styles.css --minify

# --- E2E Tests ---

# install e2e test dependencies
e2e-install:
    cd e2e && npm install

# run e2e tests (headless, auto-starts server)
e2e:
    cd e2e && npm test

# run e2e tests with visible browser
e2e-headed:
    cd e2e && npm run test:headed

# --- Orchestration ---

# install all dependencies
install:
    just ext-install
    just e2e-install

# build everything (extension + server CSS + server binary)
build browser='chrome':
    just ext-build {{browser}}
    just server-css-prod
    just server-build

# build and package extension, build server for production
release browser='chrome':
    just ext-package {{browser}}
    just server-css-prod
    just server-build

# run e2e tests (builds extension first)
test browser='chrome':
    just ext-build {{browser}}
    just e2e
