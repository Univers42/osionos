#!/bin/sh
# The sampler of the GPU: the VRAM, the busy percentage and the load average,
# once a second, into a file.
#
# usage: sh gpu-sampler.sh <file> [seconds]
#
# The driver reads the file afterwards: the peak VRAM of the run and the mean
# GPU busy percentage are the two numbers of the report that come from here.
set -eu
FILE="$1"
SECONDS_TO_RUN="${2:-600}"
: > "$FILE"
i=0
while [ "$i" -lt "$SECONDS_TO_RUN" ]; do
	printf '%s %s %s %s\n' \
		"$(date +%s)" \
		"$(cat /sys/class/drm/card1/device/mem_info_vram_used)" \
		"$(cat /sys/class/drm/card1/device/gpu_busy_percent)" \
		"$(cut -d' ' -f1 /proc/loadavg)" >> "$FILE"
	i=$((i + 1))
	sleep 1
done
