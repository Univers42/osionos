#!/bin/sh
# The sampler of the GPU of the spike (AI-A1).
#
# It samples the VRAM of the card every 200 ms, the busy percentage and the
# load average, into a file. The driver reads the file afterwards: the peak
# VRAM of the run is the number of the report that comes from here.
#
# The sampler must run for the WHOLE duration of a measured run, from before
# the model loads until after the last request. The sampler of P0d covered
# two minutes of a run of many minutes and its peak contradicted the first
# part, so the driver starts the sampler before the container and kills it
# after the last request.
#
# usage: sh gpu-sampler.sh <file> [seconds]
#
# The line is: <epoch.millis> <vram_used_bytes> <gpu_busy_percent> <loadavg>
set -eu

FILE="$1"
SECONDS_TO_RUN="${2:-600}"
: > "$FILE"
i=0
while [ "$i" -lt "$SECONDS_TO_RUN" ]; do
	printf '%s %s %s %s\n' \
		"$(date +%s.%N)" \
		"$(cat /sys/class/drm/card1/device/mem_info_vram_used)" \
		"$(cat /sys/class/drm/card1/device/gpu_busy_percent)" \
		"$(cut -d' ' -f1 /proc/loadavg)" >> "$FILE"
	i=$((i + 1))
	sleep 0.2
done
