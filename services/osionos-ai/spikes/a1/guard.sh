#!/bin/sh
# The guard of the spike (AI-A1).
#
# A measurement only counts when nothing else of the spike is measuring. The
# host is shared with other agents, and the GPU of the desktop is shared with
# the user's session, so a stray container of the spike would put its load on
# the very card whose numbers are written down.
#
# So the guard refuses to let a part start when:
#
#   - a container of the spike is running (its name starts with ai-a1-);
#   - a process of the spike runs on the host (the client containers are
#     processes of the host too);
#   - one of the ports of the part is already bound.
#
# The containers of the other agents (ai-dev-*, ai-eval-*, ai-gpu-*,
# ai-idx-*, track-binocle-*, mini-baas-*, drawnosaurus-*) are never touched.
#
# usage: sh guard.sh <what> [port ...]
#
# exit 0: the measurement may start.  exit 1: it must not.
set -eu

WHAT="${1:-spike}"
if [ "$#" -gt 0 ]; then
	shift
fi

# The containers of this spike that are running right now.
spike_containers() {
	docker ps --format '{{.Names}} {{.Image}} {{.Command}}' 2>/dev/null |
		grep -E '^ai-a1-' || true
}

# The processes of this spike, on the host.
spike_processes() {
	pgrep -af 'ai-a1-' 2>/dev/null | grep -v -E 'pgrep|guard\.sh' || true
}

# The port is bound: the local address of a listening socket ends with it.
port_bound() {
	ss -ltn 2>/dev/null | awk 'NR > 1 { print $4 }' | grep -E "[:.]${1}\$" || true
}

refuse() {
	echo "[guard] $WHAT REFUSES TO START: $1" >&2
	exit 1
}

containers=$(spike_containers)
if [ -n "$containers" ]; then
	refuse "a container of the spike is running:
$containers"
fi

processes=$(spike_processes)
if [ -n "$processes" ]; then
	refuse "a process of the spike is running:
$processes"
fi

for port in "$@"; do
	bound=$(port_bound "$port")
	if [ -n "$bound" ]; then
		refuse "the port $port is already bound: $bound"
	fi
done

echo "[guard] $WHAT may start: no container of the spike runs, the ports are free"
exit 0
