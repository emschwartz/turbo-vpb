# run the server and extension in dev mode
# Note: Firefox MV3 dev mode in WXT doesn't register content scripts in the manifest,
# so we use `web-ext run` with a development build instead of the WXT dev server.
dev browser='chrome':
    #!/usr/bin/env bash
    set -euxo pipefail
    trap "kill 0" SIGINT
    MV3_FLAG=$([[ "{{browser}}" == "firefox" ]] && echo "--mv3" || echo "")
    RUST_LOG=turbovpb_server=trace cargo run --manifest-path server/Cargo.toml &
    if [[ "{{browser}}" == "firefox" ]]; then
        cd extension && pnpm wxt build --browser firefox --mv3 --mode development \
            && npx web-ext run --source-dir .output/firefox-mv3-dev --start-url http://localhost:8080/test-phonebank
    else
        cd extension && pnpm wxt --browser {{browser}} $MV3_FLAG &
    fi
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
    #!/usr/bin/env bash
    MV3_FLAG=$([[ "{{browser}}" == "firefox" ]] && echo "--mv3" || echo "")
    cd extension && pnpm wxt build --browser {{browser}} $MV3_FLAG

# run extension in dev mode
ext-dev browser='chrome':
    #!/usr/bin/env bash
    MV3_FLAG=$([[ "{{browser}}" == "firefox" ]] && echo "--mv3" || echo "")
    cd extension && pnpm wxt --browser {{browser}} $MV3_FLAG

# package extension into a zip for store submission
ext-package browser='chrome': (ext-build browser)
    #!/usr/bin/env bash
    set -euo pipefail
    rm -f extension/turbovpb-{{browser}}.zip
    cd extension/.output/{{browser}}-mv3 && zip -r9 ../../turbovpb-{{browser}}.zip *

# package extension source code (unminified) for store review
ext-source:
    #!/usr/bin/env bash
    set -euo pipefail
    rm -f extension/turbovpb-source.zip
    cd extension && zip -r9 turbovpb-source.zip . \
        -x "node_modules/*" \
        -x ".output/*" \
        -x ".wxt/*" \
        -x "test-results/*" \
        -x "*.zip" \
        -x ".DS_Store" \
        -x "web-ext-artifacts/*"

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

# ssh into the server via fly.io
ssh:
    cd server && fly ssh console

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

# compile server typescript to static js
server-js:
    cd server && pnpm run build

# watch and rebuild server typescript
server-js-watch:
    cd server && pnpm run watch

# install server js dependencies
server-js-install:
    cd server && pnpm install

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

# --- Setup ---

# configure git to use the repo's hooks directory
setup-hooks:
    git config core.hooksPath .githooks

# --- Orchestration ---

# install all dependencies and set up hooks
install:
    just ext-install
    just server-js-install
    just e2e-install
    just setup-hooks

# build everything (extension + server CSS + server JS + server binary)
build browser='chrome':
    just ext-build {{browser}}
    just server-css-prod
    just server-js
    just server-build

# build and package extension, build server for production
release browser='chrome':
    just ext-package {{browser}}
    just server-css-prod
    just server-js
    just server-build

# build and package both extensions + source zip for store submission
publish:
    just ext-package chrome
    just ext-package firefox
    just ext-source

# run e2e tests (builds extension dev build first, since tests use chrome-mv3-dev)
test browser='chrome':
    #!/usr/bin/env bash
    MV3_FLAG=$([[ "{{browser}}" == "firefox" ]] && echo "--mv3" || echo "")
    cd extension && pnpm wxt build --browser {{browser}} --mode development $MV3_FLAG
    if [[ "{{browser}}" == "firefox" ]]; then
        cd e2e && npm run test:firefox
    else
        just e2e
    fi

# run both Chrome and Firefox e2e tests
test-all:
    just test chrome
    just test firefox
