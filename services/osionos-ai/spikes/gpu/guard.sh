#!/bin/sh
# The guard of the spike (AI-P0d).
#
# A measurement only counts when nothing else is measuring. The first run of
# this spike was contaminated: two client containers of the benchmark
# (llm-bench-gpu.mjs) were still running, with --network host, and were
# sending load to the very server whose numbers were being written down.
#
# So the guard refuses to let a part start when:
#
#   - a container of the benchmark is running (its command line holds
#     llm-bench-gpu.mjs or embed-bench-gpu.mjs);
#   - a process of the benchmark runs on the host;
#   - one of the ports of the part is already bound.
#
# usage: sh guard.sh <what> [port ...]
#
# exit 0: the measurement may start.  exit 1: it must not.
set -eu

WHAT="${1:-spike}"
if [ "$#" -gt 0 ]; then
	shift
fi

# The containers of the benchmark that are running right now.
bench_containers() {
	docker ps --format '{{.ID}} {{.Image}} {{.Command}}' 2>/dev/null |
		grep -E 'llm-bench-gpu\.mjs|embed-bench-gpu\.mjs' || true
}

# The processes of the benchmark, on the host (a docker run of the client is
# one of them: the container of the client is also a process of the host).
bench_processes() {
	pgrep -af 'llm-bench-gpu\.mjs|embed-bench-gpu\.mjs' 2>/dev/null || true
}

# The port is bound: the local address of a listening socket ends with it.
port_bound() {
	ss -ltn 2>/dev/null | awk 'NR > 1 { print $4 }' | grep -E "[:.]${1}\$" || true
}

refuse() {
	echo "[guard] $WHAT REFUSES TO START: $1" >&2
	exit 1
}

containers=$(bench_containers)
if [ -n "$containers" ]; then
	refuse "a client of the benchmark is running:
$containers"
fi

processes=$(bench_processes)
if [ -n "$processes" ]; then
	refuse "a process of the benchmark is running:
$processes"
fi

for port in "$@"; do
	bound=$(port_bound "$port")
	if [ -n "$bound" ]; then
		refuse "the port $port is already bound: $bound"
	fi
done

echo "[guard] $WHAT may start: no client of the benchmark runs, the ports are free"
exit 0
