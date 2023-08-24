# run the server and the extension in dev mode
dev browser='chrome':
    #!/usr/bin/env bash
    set -euxo pipefail
    trap "kill 0" SIGINT

    just server/run &
    just extension/dev {{browser}} &

    wait
df: (dev 'firefox')
dc: (dev 'chrome')
