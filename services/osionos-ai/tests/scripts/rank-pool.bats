#!/usr/bin/env bats
# scripts/bench/rank-pool.sh against a fake `docker` that logs its argv and prints
# a canned bench JSON chosen by the --model it was given: no container, no network.
#
# Run: docker run --rm -v "$PWD:/code" -w /code --entrypoint sh bats/bats:1.11.1 \
#        -c 'apk add -q --no-cache jq curl bash && bats tests/scripts/rank-pool.bats'

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/bench/rank-pool.sh"
  BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$BIN"
  export DOCKER_LOG="$BATS_TEST_TMPDIR/docker"
  : >"$DOCKER_LOG"
  cat >"$BIN/docker" <<'FAKE'
#!/bin/sh
printf '%s\n' "$*" >>"$DOCKER_LOG"
case "$*" in
*"--model silent "*) echo '{"n":20,"successRate":1,"firstPartP50":null,"firstPartP95":null,"itlP95":null,"aggregateTokPerS":null,"reasoningRuns":0}' ;;
*"--model slow "*) echo '{"n":20,"successRate":1,"firstPartP50":50000,"firstPartP95":95000,"itlP95":10,"aggregateTokPerS":5,"reasoningRuns":2}' ;;
*) echo '{"n":20,"successRate":1,"firstPartP50":800,"firstPartP95":1200,"itlP95":10,"aggregateTokPerS":40,"reasoningRuns":0}' ;;
esac
FAKE
  chmod +x "$BIN/docker"
  PATH="$BIN:$PATH"
  export SECRET_VALUE="sk-test-SECRET-123"
  unset OSIONOS_AI_KEY_ALPHA OSIONOS_AI_PLATFORM_MODELS OSIONOS_AI_UPSTREAM_BASE_URL
  OUT="$BATS_TEST_TMPDIR/rank.md"
}

provider() { # id keyEnv(or empty) upstreamId
  printf '{"id":"%s",%s"baseUrl":"https://%s.invalid/v1","wire":"openai-compatible","models":[{"id":"m","label":"M","upstreamId":"%s","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0}]}' \
    "$1" "${2:+\"apiKeyEnv\":\"$2\",}" "$1" "$3"
}

@test "unset key: provider skipped with its id on stderr and no request is sent" {
  export OSIONOS_AI_PLATFORM_PROVIDERS="[$(provider alpha OSIONOS_AI_KEY_ALPHA fast)]"
  run --separate-stderr bash "$SCRIPT" --out "$OUT" --n 3
  [ "$status" -eq 1 ]
  [[ "$stderr" == *"skip alpha"* ]]
  [ ! -s "$DOCKER_LOG" ]
}

@test "keyless provider is benched with no auth file; a keyed one gets --plain and a header file, never the key" {
  export OSIONOS_AI_KEY_ALPHA="$SECRET_VALUE"
  export OSIONOS_AI_PLATFORM_PROVIDERS="[$(provider free '' fast),$(provider alpha OSIONOS_AI_KEY_ALPHA fast2)]"
  run --separate-stderr bash "$SCRIPT" --out "$OUT" --n 3
  [ "$status" -eq 0 ]
  [ "$(grep -c -- '--auth-file' "$DOCKER_LOG")" -eq 1 ]
  [ "$(grep -c -- '--plain' "$DOCKER_LOG")" -eq 2 ]
  ! grep -q "$SECRET_VALUE" "$DOCKER_LOG"
  [[ "$stderr" != *"$SECRET_VALUE"* ]]
}

@test "null p95 and p95 > 90 s are both flagged NOT-FIRST; a fast model is not" {
  export OSIONOS_AI_PLATFORM_PROVIDERS="[$(provider p1 '' silent),$(provider p2 '' slow),$(provider p3 '' fast)]"
  run --separate-stderr bash "$SCRIPT" --out "$OUT" --n 3
  [ "$status" -eq 0 ]
  grep 'p1/silent' "$OUT" | grep -q 'NOT-FIRST'
  grep 'p2/slow' "$OUT" | grep -q 'NOT-FIRST'
  ! grep 'p3/fast' "$OUT" | grep -q 'NOT-FIRST'
}
