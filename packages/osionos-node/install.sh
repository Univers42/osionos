#!/bin/sh
# Puts ~/.osionos in the layout the app's start command names: src (an osionos
# checkout with dist-ide built) and server/<VS Code version> (the pinned server's lib).
# The app handed out that command with nothing to create the layout, so a machine not
# set up by hand failed with MODULE_NOT_FOUND.
#
# OSIONOS_DATA   where the heavy files go, linked from ~/.osionos. The server alone is
#                over 400 MB, and a school home has less than that free.
# OSIONOS_SRC    an existing checkout to link instead of cloning.
#
# Caveat: re-running keeps an existing server and dist-ide; it does not update them.
# Delete them to upgrade. The tarball is checked against server-pin.json, its contents
# are trusted from there on.
set -eu

REPO=https://github.com/Univers42/osionos.git
HOME_DIR=$HOME/.osionos
DATA=${OSIONOS_DATA:-$HOME_DIR}

fail() {
    echo "osionos install: $1" >&2
    exit 1
}

command -v node >/dev/null || fail "node 22 or newer is required"
command -v git >/dev/null || fail "git is required"
mkdir -p "$HOME_DIR" "$DATA"
chmod 700 "$HOME_DIR"

# A symlink only when the data lives elsewhere: ln onto itself would nest a loop.
link_home() {
    [ "$DATA" = "$HOME_DIR" ] || ln -sfn "$DATA/$1" "$HOME_DIR/$1"
}

if [ -n "${OSIONOS_SRC:-}" ]; then
    ln -sfn "$OSIONOS_SRC" "$HOME_DIR/src"
elif [ ! -d "$DATA/src/.git" ]; then
    git clone --depth 1 --branch main --recurse-submodules --shallow-submodules "$REPO" "$DATA/src"
    link_home src
else
    link_home src
fi
SRC=$HOME_DIR/src
[ -f "$SRC/packages/osionos-node/cli.mjs" ] || fail "$SRC is not an osionos checkout"

# The IDE page and the in-place terminal page are two builds.
build_page() {
    [ ! -f "$SRC/$1/index.html" ] || return 0
    if command -v pnpm >/dev/null; then
        (cd "$SRC" && pnpm install --frozen-lockfile && pnpm exec vite build --config "$2")
    elif command -v docker >/dev/null; then
        (cd "$SRC" && bash scripts/docker-run.sh "$3")
    else
        fail "building the pages needs pnpm or docker"
    fi
}
build_page dist-ide vite.ide.config.ts build-ide
build_page build/terminal vite.terminal.config.ts build-terminal

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
    # macOS ships shasum, Linux sha256sum.
    if command -v sha256sum >/dev/null; then sum=sha256sum; else sum="shasum -a 256"; fi
    echo "$SHA  $TMP/$ASSET" | $sum -c - >/dev/null || fail "$ASSET does not match its pinned sha256"
    tar -xzf "$TMP/$ASSET" -C "$TMP"
    mkdir -p "$DATA/server"
    rm -rf "$SERVER"
    mv "$TMP/${ASSET%.tar.gz}/lib" "$SERVER"
fi
link_home server

echo "osionos-node is installed in $HOME_DIR"
echo "Pair this machine once:  node $SRC/packages/osionos-node/cli.mjs pair --bridge <bridge url> --name <name>"
echo "Then run the start command the app shows."
