# M5 — Voice: the dictation and the read-aloud

The slice of the school module IV.4 "voice / speech": the user speaks, the text
lands in the composer **as typed input**, and an answer can be read aloud on the
device.

Everything here is bound to the conditions **C58–C65** of
the events and voice devil verdict (conditions C58–C65, §4), kept with the
project's review records outside this repository. The out-of-scope of this
slice is written at the bottom.

---

## What an evaluator does in three minutes

**0. Before the first start — the model (the only step with egress).**

```sh
# In the groot worktree. The model is pre-fetched into the named volume; the
# speech-to-text server itself never reaches the internet (HF_HUB_OFFLINE=1).
docker compose --profile ai run --rm --no-deps osionos-ai-stt \
  python -c "from huggingface_hub import snapshot_download; import os; \
    p = snapshot_download('Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120'); \
    r = os.path.join(os.path.dirname(p), '..', 'refs', 'main'); \
    os.makedirs(os.path.dirname(r), exist_ok=True); \
    open(r, 'w').write('536b0662742c02347bc0e980a01041f333bce120')"
```

**1. The stack.** `docker compose --profile ai up -d --build` (groot worktree),
then the app on <https://localhost:3001> with the AI service behind
<https://localhost:4000>.

**2. The dictation.** Click the microphone of the composer (the assistant's, or
the channel's — the second one has an accent ring so the two are told apart).
Say a sentence. Press the button again (or wait for the 30 s cap: the ring
pulses and the seconds left are written next to it). The text lands **in the
box, where the caret was** — nothing is sent, nothing is approved.

**3. The read-aloud.** Open an answer of the assistant and press "Read aloud".
The voice is one of the device's own. In **Settings › Accessibility & voice**
the language of the dictation, the voice, its rate, and the opt-in of the
online voices live.

**4. The keyboard.** `Ctrl+Shift+D` (`Cmd+Shift+D` on a mac) toggles the
dictation of the composer that holds the caret — and of no other one.

---

## The commands (the gates)

```sh
# <the groot worktree root>: it holds models/osionos-ai-migration.sql and
# models/osionos-ai-rag-migration.sql.
S="<the groot worktree root>"

# The service (throwaway Postgres + Redis, the AI migrations, the suite).
sh services/osionos-ai/scripts/test.sh "$S/models/osionos-ai-migration.sql" \
                                           "$S/models/osionos-ai-rag-migration.sql"

# The layout of the service.
docker run --rm -v "$PWD":/app -w /app/services/osionos-ai node:22-bookworm-slim \
  node_modules/.bin/tsc --noEmit -p tsconfig.json

# The client.
bash scripts/docker-run.sh test-canvas
bash scripts/docker-run.sh typecheck
bash scripts/docker-run.sh lint

# The stack (groot worktree).
docker compose -f docker-compose.yml --profile ai config -q
docker run --rm -v "$PWD/infrastructure/tls":/etc/nginx/conf.d:ro nginx:1.27-alpine nginx -t
```

---

## What proves what

| Condition | What it says | Where it is proved |
|---|---|---|
| **C58** | The STT server is internal, pinned and capped | `docker compose config`: no `ports`, `osionos-ai-stt-net` is `internal: true`, `mem_limit`/`cpus` set. The image is pinned by digest, the model by revision + sha256 |
| **C59** | The audio is distrusted | `services/osionos-ai/src/voice/wav.ts` accepts ONLY RIFF/WAVE, PCM, 1 channel, 16 kHz, 16 bits, one `data` chunk, a RIFF size that matches the file. The table of the refusals is `tests/voice.test.ts` (44.1 kHz, stereo, float32, 8-bit, truncated, a RIFF size that lies, a PNG wearing the label `audio/wav`) |
| **C60** | The quotas and the fairness | 30 s and 1 MB per request (`MAX_DICTATION_BYTES = 960_044`), 1 call at a time per user (a lock in Redis), the seconds of the day (`OSIONOS_AI_STT_SECONDS_PER_DAY`, default 600) — `tests/voice.test.ts`. The recorder stops itself at the cap: `tests/canvas/voice-recorder.test.ts` |
| **C61** | The dictation audio is ephemeral | The audio is a Buffer in the request, it is never written, and the service logs the request and nothing else — `tests/voice.test.ts` ("the transcript and the audio never reach a log line") |
| **C62** | The voice-note transcripts | **Out of this slice** (slice B2) |
| **C63** | The chat is not indexed into RAG | **Blocked** — and the static test says so: `tests/voice.test.ts` ("no indexer or retrieval reads a message or an attachment source") |
| **C64** | `speechSynthesis` stays local | `src/features/voice/model/readAloud.ts` filters to `localService === true` unless the user opted in — `tests/canvas/voice-dictation.test.ts`. The grep gate: 0 `SpeechRecognition` in `src/` |
| **C65** | The voice never executes or approves | The transcript is TYPED INPUT (`insertTranscript.ts`), it never submits; the barge-in is proved by the order of the spies (`speechSynthesis.cancel()` BEFORE `getUserMedia`); the state is visible and the `aria-live` region reads the final text only |

---

## The pinned things

| What | Value |
|---|---|
| The STT image | `ghcr.io/speaches-ai/speaches:0.8.3-cpu` |
| The digest of the image | `sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8` |
| The date of the image | built 2025-09-19 (far more than the seven days of C58) |
| The model | `Systran/faster-whisper-small` |
| The revision of the model | `536b0662742c02347bc0e980a01041f333bce120` |
| The sha256 of `model.bin` | `3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671` (483 546 902 bytes) |

---

## Caveats

- **Caveat: WER and latency of the dictation (measured, A1).** `faster-whisper-small`
  on speaches, `--cpus 5`, FLEURS test split, 100 clips per language:
  WER en_us 0.064 (95 % CI [0.051, 0.079]), fr_fr 0.128 ([0.106, 0.150]),
  es_419 0.049 ([0.039, 0.061]); p95 latency 4.64 s / 4.78 s / 4.70 s;
  p95 RTF 0.579 / 0.535 / 0.469. Measured with
  `services/osionos-ai/spikes/a1/stt.sh` (see
  `services/osionos-ai/spikes/a1/stt-bench.py`); full numbers in
  `services/osionos-ai/spikes/a1/results/stt/RESULTS.md`. Decision: small stays;
  turbo's WER is lower in fr/es but its p95 RTF is above 0.5 on this CPU.
- **Caveat: cut-off words (measured, A1, same clips).** Reference words lost
  at the start or the end of a clip, `faster-whisper-small`: en_us 8 of 2235
  (0.004), fr_fr 15 of 2556 (0.006), es_419 0 of 2473. Nearly all at the start
  of a clip. FLEURS clips are whole sentences, so the app's own recorder stop is
  not measured. Table and definition in `results/stt/RESULTS.md` "Cut-off words".
- **Caveat:** FLEURS is read speech, not dictation; the CPU was shared with
  other jobs during the measurement (load 6-14); the normaliser is NFKC +
  lowercase + punctuation removed, not Whisper's own, so the numbers are not
  comparable to papers.
- **Caveat: the voices of the browsers are measured on ONE platform.** The
  table below has one measured row; the others are the same command on another
  machine. The command that produced it:

  ```sh
  google-chrome --headless=new --no-sandbox --disable-gpu \
    --virtual-time-budget=4000 --dump-dom file:///tmp/opencode/voices.html
  ```

  | Browser | OS | Voices | `localService === true` |
  |---|---|---|---|
  | Chrome (headless) | Linux (this host) | 0 — the host has no speech service | 0 |
  | Chrome / Edge | macOS, Windows, Linux | **TO MEASURE** | **TO MEASURE** |
  | Firefox | macOS, Windows, Linux | **TO MEASURE** | **TO MEASURE** |
  | Safari | macOS, iOS | **TO MEASURE** | **TO MEASURE** |

  The rule of the code does not depend on the table: only the voices whose
  `localService` is true are offered, and a remote voice appears only after the
  opt-in that says the text leaves the device.
- **Caveat: the nginx gate of the brief mounts the conf in the wrong place.**
  `infrastructure/tls/nginx.conf` is the WHOLE configuration (`events {}` and
  `http {}`), so it belongs at `/etc/nginx/nginx.conf` — which is where the
  compose puts it. Mounted at `/etc/nginx/conf.d` (the command of the brief),
  nginx reads it as a server-level file and refuses it with *"events directive
  is not allowed here"*. The validation that counts:

  ```sh
  docker run --rm -v "$PWD/infrastructure/tls/nginx.conf":/etc/nginx/nginx.conf:ro \
    -v /tmp/opencode/certs:/etc/track-binocle/certs:ro \
    -v "$PWD/infrastructure/tls/public.d":/etc/nginx/track-binocle.d:ro \
    nginx:1.27-alpine nginx -t
  ```

  (the certs are a throwaway self-signed pair: the conf points at
  `/etc/track-binocle/certs/localhost.pem`).
- **Caveat: the voice route is OFF on the public stack.** `public.d/` is
  untouched, and the public deployment has no speech-to-text server: the route
  answers 503 `voice_unavailable` there until the user says otherwise.
- **Caveat: the app origin's policy.** The app's `Permissions-Policy` is the
  one of the TLS front door of the app origin:
  `infrastructure/tls/nginx.conf:115` — the `server { listen 3001 ssl; }`
  block, which serves **both** `https://localhost:3001` and
  `https://localhost:13001` (the port is the published one, the block is the
  same). It allows `microphone=(self)`. The landing site keeps its own,
  stricter policy at `infrastructure/tls/nginx.conf:87` (`microphone=()`), and
  the two were never the same header. The deployed app (Vercel) carries its own
  header, `microphone=(self)`, in `vercel.json:18`.

---

## Out of this slice

- **The transcripts of the voice notes (C62)** — slice B2, with its own
  server-only column and its own worker.
- **The decoding of an uploaded audio on the server (C59's worker)** — the
  dictation does not need it: the browser decodes, and the server verifies the
  bytes it is given.
- **RAG over the chat (C63)** — blocked, and the static test keeps it blocked.
- **The database** — no migration in this slice: the counters are in Redis.
