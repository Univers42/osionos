# A1 — Speech-to-text for the M5 dictation: faster-whisper small vs large-v3-turbo on speaches

This spike measures the word error rate, latency and memory of the two
candidate Whisper models behind the M5 dictation, running on the speaches
server exactly as production pins it (image by digest, `--cpus 5`,
`--memory 6g`, `HF_HUB_OFFLINE=1`). The dictation ships
`faster-whisper-small` today and groot's compose marks its `cpus` and
`mem_limit` **PROVISIONAL** (4 CPUs / 2 GB) until this measurement exists;
this document is that measurement. Every number below is copied from
`summary-stt.json`, `load.log` or `rss-*.log` — none was recomputed. Rounding:
WER/RTF to 3 decimals, seconds to 2 decimals.

## The command

```sh
services/osionos-ai/spikes/a1/stt.sh
```

which runs, per model, `stt-bench.py run` (one warm-up call not counted, then
all 300 clips) and finally:

```sh
docker run --rm -v "$HERE":/spike:ro -v "$OUT":/out python:3.12-slim \
    python3 -I /spike/stt-bench.py summarize --raw /out/raw --out /out/summary-stt.json
```

Branch base commit: `ef99fd7389eb9317b08b2b9339e40a1bed39645c`
(`git rev-parse HEAD`).

## The pins

- Image: `ghcr.io/speaches-ai/speaches:0.8.3-cpu@sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8`
- Server caps: `--cpus 5 --memory 6g`, `HF_HUB_OFFLINE=1`
- Model A — `Systran/faster-whisper-small`, revision
  `536b0662742c02347bc0e980a01041f333bce120`
  (`services/osionos-ai/spikes/a1/models.lock`, stt rows)
- Model B — `deepdml/faster-whisper-large-v3-turbo-ct2`, revision
  `4df90f75321148c3a29a9e2351b7ddf8f5b115a8`
  (`services/osionos-ai/spikes/a1/models.lock`, stt rows)
- Clips: FLEURS test split, 100 clips per language (`en_us`, `fr_fr`,
  `es_419`), seed 42, recorded in `clips.tsv` (300 rows);
  `services/osionos-ai/spikes/a1/fetch-fleurs.py`.

## WER

| Model | Language | WER | 95 % CI | Ref words | Clips |
|---|---|---|---|---|---|
| Systran/faster-whisper-small | en_us | 0.064 | [0.051, 0.079] | 2235 | 100 |
| Systran/faster-whisper-small | fr_fr | 0.128 | [0.106, 0.150] | 2556 | 100 |
| Systran/faster-whisper-small | es_419 | 0.049 | [0.039, 0.061] | 2473 | 100 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | en_us | 0.054 | [0.040, 0.070] | 2235 | 100 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | fr_fr | 0.065 | [0.051, 0.081] | 2556 | 100 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | es_419 | 0.028 | [0.021, 0.036] | 2473 | 100 |

## Paired difference (WER(turbo) − WER(small))

| Language | Δ WER | 95 % CI | Excludes 0 |
|---|---|---|---|
| en_us | -0.010 | [-0.022, 0.000] | no |
| fr_fr | -0.063 | [-0.076, -0.049] | yes |
| es_419 | -0.021 | [-0.029, -0.014] | yes |

## Latency

| Model | Language | p50 (s) | p95 (s) | RTF p50 | RTF p95 |
|---|---|---|---|---|---|
| Systran/faster-whisper-small | en_us | 2.78 | 4.64 | 0.290 | 0.579 |
| Systran/faster-whisper-small | fr_fr | 3.27 | 4.78 | 0.307 | 0.535 |
| Systran/faster-whisper-small | es_419 | 3.41 | 4.70 | 0.290 | 0.469 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | en_us | 6.41 | 8.34 | 0.679 | 1.295 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | fr_fr | 6.69 | 7.45 | 0.650 | 1.082 |
| deepdml/faster-whisper-large-v3-turbo-ct2 | es_419 | 6.67 | 9.46 | 0.588 | 0.914 |

## Memory

Peak of each `rss-*.log` (`sort -h … | tail -1`) against the 6 GiB cap:

- `rss-Systran--faster-whisper-small.log`: peak 1.47 GiB (of 6 GiB)
- `rss-deepdml--faster-whisper-large-v3-turbo-ct2.log`: peak 4.065 GiB (of 6 GiB)

## Load lines

The before/after lines of `load.log`, verbatim (the measurement ran at load
6–14, not on a quiet host):

```
load 13.17 > 6, waiting 5 min
load 9.82 > 6, waiting 5 min
load 9.00 > 6, waiting 5 min
load 9.55 > 6, waiting 5 min
load 9.46 > 6, waiting 5 min
load 11.36 > 6, waiting 5 min
load still high after 30 min, running anyway
== Systran/faster-whisper-small before:  01:43:37 up  9:03,  1 user,  load average: 7.85, 8.99, 9.27
               total        used        free      shared  buff/cache   available
Mem:              31          20           1           0           8          10
Swap:             24          18           6
== Systran/faster-whisper-small after:  02:00:00 up  9:19,  1 user,  load average: 12.52, 14.56, 13.04
               total        used        free      shared  buff/cache   available
Mem:              31          22           0           0           8           8
Swap:             24          19           5
load 12.52 > 6, waiting 5 min
== deepdml/faster-whisper-large-v3-turbo-ct2 before:  02:05:00 up  9:24,  1 user,  load average: 5.93, 9.98, 11.54
               total        used        free      shared  buff/cache   available
Mem:              31          17           4           0           9          13
Swap:             24          13          11
== deepdml/faster-whisper-large-v3-turbo-ct2 after:  02:39:48 up  9:59,  1 user,  load average: 9.81, 9.37, 9.60
               total        used        free      shared  buff/cache   available
Mem:              31          20           2           0           7          10
Swap:             24          17           7
```

The run used the `wait_for_load` gate (threshold 6) and, after 30 min of
waiting, printed `load still high … running anyway` and ran at 1-min load
averages between 5.93 and 12.52 (≈ 6–14). Latency is therefore pessimistic and
noisy.

## Decision

Rule: switch to large-v3-turbo only if, in at least 2 of the 3 languages, its
WER is lower with the paired CI excluding 0, **and** its p95 RTF ≤ 0.5 at
`--cpus 5`.

- WER half: holds. turbo's WER is lower with the paired CI excluding 0 in
  fr_fr (Δ -0.063, CI [-0.076, -0.049]) and es_419 (Δ -0.021, CI
  [-0.029, -0.014]); 2 of 3 languages. en_us does not qualify (Δ -0.010,
  CI [-0.022, 0.000], includes 0).
- RTF half: fails in all three languages — p95 RTF 1.295 (en_us), 1.082
  (fr_fr), 0.914 (es_419), all above 0.5.

Outcome: **keep small**. Turbo's WER is lower in fr/es but its p95 RTF is
above 0.5 on this CPU, so the rule's second condition fails.

Compose recommendation for groot (do not edit groot here): the measurement used
5 CPUs; set `mem_limit` to the small model's measured peak plus 30 %, rounded
up to 0.5 GB = 1.47 GiB × 1.30 = 1.911 GiB → **2.0 GB**. The current
values are 4 CPUs / 2 GB (`docs/ai/modules/m5-voice.md` caveat). The measured
peak (1.47 GiB) fits under the current 2 GB cap.

## Caveat

- The normaliser is not Whisper's own: NFKC, lowercase, punctuation removed;
  numbers are not spelled out, hyphen-joined words stay glued, accents stay
  significant. The numbers are not comparable to papers.
- FLEURS is read speech, not dictation.
- The CPU was shared with other jobs at the loads above (6–14), so latency is
  pessimistic and noisy.
- 100 clips per language: the CI says how much the WER moves with the clips,
  not with the speakers or the microphone.
- RSS is sampled every 2 s, so a shorter peak can be missed (under-reports).
