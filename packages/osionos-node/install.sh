#!/bin/sh
# Installs or updates osionos-node, then connects this computer: what the app's one command
# runs. Arguments go to `osionos-node connect`; without any it only installs.
#
# ~/.osionos: src (an osionos checkout with its two pages built) and server/<VS Code version>
# (the pinned server's lib).
#
# OSIONOS_DATA   where the heavy files go, linked from ~/.osionos. The server alone is over
#                600 MB unpacked. Defaults to /sgoinfre/students/$USER where that exists: a
#                42 home has less than that free.
# OSIONOS_SRC    an existing checkout to link instead of cloning; it is not updated.
#
# Caveat: the prebuilt pages are the newest main that CI finished, so right after a push they
# can trail the clone by a build. Re-running fetches them again only when the commit changed.
# The pages' sha256 comes from the same release, so it catches corruption, not a compromised
# release; the server tarball is checked against server-pin.json. Without systemd or launchd
# the node lasts as long as its terminal, and a systemd user service stops at logout unless
# lingering is on. The free-space check is a floor, not a measure of what will be needed.
set -eu

REPO=https://github.com/Univers42/osionos.git
HOME_DIR=$HOME/.osionos
if [ -z "${OSIONOS_DATA:-}" ] && [ -d "/sgoinfre/students/${USER:-}" ]; then
    OSIONOS_DATA=/sgoinfre/students/$USER/.osionos-data
fi
DATA=${OSIONOS_DATA:-$HOME_DIR}
NEEDED_KB=2000000

fail() {
    echo "osionos install: $1" >&2
    exit 1
}

command -v node >/dev/null || fail "node 22 or newer is required"
command -v git >/dev/null || fail "git is required"
mkdir -p "$HOME_DIR" "$DATA"
chmod 700 "$HOME_DIR"

FREE_KB=$(df -Pk "$DATA" | awk 'NR == 2 { print $4 }')
if [ ! -d "$DATA/src" ] && [ "${FREE_KB:-0}" -lt "$NEEDED_KB" ]; then
    fail "$DATA has $((FREE_KB / 1024)) MB free and needs 2 GB: set OSIONOS_DATA to a bigger disk"
fi

# A symlink only when the data lives elsewhere: ln onto itself would nest a loop.
link_home() {
    [ "$DATA" = "$HOME_DIR" ] || ln -sfn "$DATA/$1" "$HOME_DIR/$1"
}

if [ -n "${OSIONOS_SRC:-}" ]; then
    ln -sfn "$OSIONOS_SRC" "$HOME_DIR/src"
elif [ ! -d "$DATA/src/.git" ]; then
    git clone --depth 1 --branch main "$REPO" "$DATA/src"
    link_home src
else
    # A node older than the app answers but cannot open a terminal: an update rebuilds the pages.
    before=$(git -C "$DATA/src" rev-parse HEAD)
    git -C "$DATA/src" pull --ff-only
    if [ "$before" != "$(git -C "$DATA/src" rev-parse HEAD)" ]; then
        rm -rf "$DATA/src/dist-ide" "$DATA/src/build/terminal" "$DATA/src/build/editor"
    fi
    link_home src
fi
SRC=$HOME_DIR/src
[ -f "$SRC/packages/osionos-node/cli.mjs" ] || fail "$SRC is not an osionos checkout"

# The two pages come prebuilt from CI (release node-pages), so a machine needs neither pnpm nor
# docker. Building from the checkout is what a machine falls back to when that is unreachable.
PAGES=https://github.com/Univers42/osionos/releases/download/node-pages/osionos-node-pages.tar.gz

download_pages() {
    TMP_PAGES=$(mktemp -d "$DATA/pages.XXXXXX")
    if curl -fsSL --retry 3 -o "$TMP_PAGES/pages.tar.gz" "$PAGES" \
        && curl -fsSL --retry 3 -o "$TMP_PAGES/pages.sha256" "$PAGES.sha256" \
        && (cd "$TMP_PAGES" && sha256 -c pages.sha256 >/dev/null); then
        tar -xzf "$TMP_PAGES/pages.tar.gz" -C "$SRC/"
        rm -rf "$TMP_PAGES"
        return 0
    fi
    rm -rf "$TMP_PAGES"
    return 1
}

build_pages() {
    git -C "$SRC" submodule update --init --recursive --depth 1
    if command -v pnpm >/dev/null; then
        (cd "$SRC" && pnpm install --frozen-lockfile \
            && pnpm exec vite build --config vite.ide.config.ts \
            && pnpm exec vite build --config vite.terminal.config.ts \
            && pnpm exec vite build --config vite.editor.config.ts)
    elif command -v docker >/dev/null; then
        (cd "$SRC" && bash scripts/docker-run.sh build-ide && bash scripts/docker-run.sh build-terminal && bash scripts/docker-run.sh build-editor)
    else
        fail "the prebuilt pages could not be downloaded, and building them needs pnpm or docker"
    fi
}

# macOS ships shasum, Linux sha256sum.
sha256() {
    if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

if [ ! -f "$SRC/dist-ide/index.html" ] || [ ! -f "$SRC/build/terminal/index.html" ] || [ ! -f "$SRC/build/editor/index.html" ]; then
    download_pages || build_pages
fi

pin() {
    node -e "const s=require('$SRC/packages/osionos-node/server-pin.json').server;console.log(eval(process.argv[1]))" "$1"
}
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) PLATFORM=linux-x64 ;;
    Linux-aarch64) PLATFORM=linux-arm64 ;;
    Darwin-x86_64) PLATFORM=darwin-x64 ;;
    Darwin-arm64) PLATFORM=darwin-arm64 ;;
    *) fail "no pinned server for $(uname -s) $(uname -m)" ;;
esac
VSCODE=$(pin s.vscode)
SERVER=$DATA/server/$VSCODE
if [ ! -x "$SERVER/node" ]; then
    VERSION=$(pin s.version)
    ASSET=$(pin "s.upstream['$PLATFORM'].asset")
    SHA=$(pin "s.upstream['$PLATFORM'].sha256")
    TMP=$(mktemp -d "$DATA/download.XXXXXX")
    trap 'rm -rf "$TMP"' EXIT
    curl -fL --retry 3 -o "$TMP/$ASSET" \
        "https://github.com/coder/code-server/releases/download/v$VERSION/$ASSET"
    echo "$SHA  $TMP/$ASSET" | sha256 -c - >/dev/null || fail "$ASSET does not match its pinned sha256"
    tar -xzf "$TMP/$ASSET" -C "$TMP"
    mkdir -p "$DATA/server"
    rm -rf "$SERVER"
    mv "$TMP/${ASSET%.tar.gz}/lib" "$SERVER"
fi
link_home server

# Define NODE and CLI before writing the binary wrapper
NODE=$(command -v node)
CLI=$SRC/packages/osionos-node/cli.mjs

# Create binary wrapper BEFORE checking args
BIN_DIR=$HOME/.local/bin
mkdir -p "$BIN_DIR"
{
    echo '#!/bin/sh'
    echo 'case "${1:-}" in'
    echo '    update|--update)'
    echo '        shift'
    printf "        exec '%s' '%s' update \"\$@\"\n" "$NODE" "$CLI"
    echo '        ;;'
    echo '    *)'
    printf "        exec '%s' '%s' open \"\$@\"\n" "$NODE" "$CLI"
    echo '        ;;'
    echo 'esac'
} >"$BIN_DIR/osionos"
chmod 755 "$BIN_DIR/osionos"

# When $# -eq 0 (update/install without connect args):
if [ "$#" -eq 0 ]; then
    if [ -f "$HOME_DIR/start.sh" ]; then
        if command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
            systemctl --user daemon-reload
            systemctl --user enable osionos-node.service >/dev/null 2>&1
            systemctl --user restart osionos-node.service
            echo "osionos-node is updated and running as a service. Stop it with: systemctl --user disable --now osionos-node"
            exit 0
        fi
    fi
    if [ "$(uname -s)" = Darwin ]; then
        PLIST=$HOME/Library/LaunchAgents/com.osionos.node.plist
        if [ -f "$PLIST" ]; then
            launchctl unload "$PLIST" 2>/dev/null || true
            launchctl load "$PLIST"
            echo "osionos-node is updated. Stop it with: launchctl unload $PLIST"
            exit 0
        fi
    fi
    echo "osionos-node is installed in $HOME_DIR"
    exit 0
fi

# curl | sh gives this script the pipe as stdin; pairing asks its question on the terminal.
if [ -f "$HOME_DIR/machine.json" ]; then
    : # Paired already: nothing to ask, and a run from cron or a service has no terminal.
elif ! (: </dev/tty) 2>/dev/null; then
    fail "pairing needs a terminal to confirm in: run this from one"
else
    "$NODE" "$CLI" connect --pair-only "$@" </dev/tty
fi

# The start command, with each argument quoted, so a login can run it with nobody at a terminal.
START=$HOME_DIR/start.sh
{
    echo '#!/bin/sh'
    printf 'exec %s %s connect' "$NODE" "$CLI"
    for arg in "$@"; do
        printf " '%s'" "$(printf '%s' "$arg" | sed "s/'/'\\\\''/g")"
    done
    echo
} >"$START"
chmod 700 "$START"

# The node stays up without a terminal: a service restarts it and starts it at login.
if command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
    UNIT_DIR=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
    mkdir -p "$UNIT_DIR"
    cat >"$UNIT_DIR/osionos-node.service" <<UNIT
[Unit]
Description=osionos-node, this computer's terminal for osionos

[Service]
ExecStart=$START
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable osionos-node.service >/dev/null 2>&1
    systemctl --user restart osionos-node.service
    echo "osionos-node is running as a service. Stop it with: systemctl --user disable --now osionos-node"
    exit 0
fi
if [ "$(uname -s)" = Darwin ]; then
    PLIST=$HOME/Library/LaunchAgents/com.osionos.node.plist
    mkdir -p "$(dirname "$PLIST")"
    cat >"$PLIST" <<PLIST_BODY
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.osionos.node</string>
<key>ProgramArguments</key><array><string>$START</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
</dict></plist>
PLIST_BODY
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "osionos-node is running. Stop it with: launchctl unload $PLIST"
    exit 0
fi
echo "No service manager here: keep this terminal open."
exec "$START"
