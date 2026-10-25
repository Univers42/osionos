#!/bin/sh
# One configuration of the LLM server, measured once: the VRAM it takes, the
# speed of the prefill and the speed of the decode.
#
# usage: sh try-llm.sh <name> <extra llama-server flags...>
set -eu
NAME="$1"
shift
PORT="${PORT:-18080}"
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH= cd -- "$SPIKE_DIR/../.." && pwd)
MODEL=/models/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/snapshots/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf

BEFORE=$(cat /sys/class/drm/card1/device/mem_info_vram_used)
docker rm -f ai-gpu-try >/dev/null 2>&1 || true
docker run -d --name ai-gpu-try \
	--device /dev/dri --group-add 993 \
	-v osionos_ai_models_llm:/models:ro \
	-p "127.0.0.1:$PORT:8080" \
	ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
	-m "$MODEL" --alias qwen3-4b --host 0.0.0.0 --port 8080 --jinja --metrics -lv 5 \
	"$@" >/dev/null

waited=0
until curl -sS -m 5 "http://127.0.0.1:$PORT/v1/models" 2>/dev/null | grep -q '"id"'; do
	waited=$((waited + 1))
	if [ "$waited" -gt 120 ]; then echo "$NAME: never became ready"; docker logs ai-gpu-try | tail -20; exit 1; fi
	sleep 1
done
AFTER=$(cat /sys/class/drm/card1/device/mem_info_vram_used)
echo "== $NAME =="
echo "vram before=$BEFORE after=$AFTER delta=$((AFTER - BEFORE))"

# one request, with the prompt of the service
docker run --rm --network host -v "$SERVICE_DIR:/s" -w /s node:22-bookworm-slim \
	node --input-type=module -e "
import { buildRequests } from './spikes/gpu/requests.mjs';
const CONC = Number(process.env.CONC || 1);
const { requests } = buildRequests({ count: Math.max(CONC, 4) });
const one = async (r) => {
  const body = { model: 'qwen3-4b', messages: r.messages, tools: r.tools, stream: true, max_tokens: 100, temperature: 0, cache_prompt: true };
  const t0 = performance.now();
  const res = await fetch('http://127.0.0.1:$PORT/v1/chat/completions', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) { console.log('HTTP', res.status, (await res.text()).slice(0,200)); return null; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let first = null, last = null, timings = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, i); buf = buf.slice(i+2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try { const o = JSON.parse(line.slice(5).trim()); if (o.timings) timings = o.timings; const c = o.choices?.[0]?.delta?.content; if (c) { if (first===null) first = performance.now(); last = performance.now(); } } catch {}
      }
    }
  }
  console.log('ttft_ms', first===null?'none':(first - t0).toFixed(0), 'total_ms', last===null?'none':(last - t0).toFixed(0), 'timings', JSON.stringify(timings));
  return timings;
};
if (CONC === 1) await one(requests[0]);
else await Promise.all(requests.slice(0, CONC).map(one));
" 2>&1 | tail -6

docker logs ai-gpu-try 2>&1 | grep -iE 'kv_|buffer|offload|vulkan.*(mem|alloc)|CPU_Mapped|device' | head -25
docker rm -f ai-gpu-try >/dev/null 2>&1 || true
