#!/usr/bin/env bats
# scripts/list-provider-models.sh against a fake `curl`: no network is touched.
# The fake logs every argv, answers /models by URL, and copies the content of any
# `-H @file` header file to $SEEN_AUTH, so the test can prove the key travelled
# through the file and never through argv.
#
# Run: docker run --rm -v "$PWD:/code" -w /code --entrypoint sh bats/bats:1.11.1 \
#        -c 'apk add -q --no-cache jq curl && bats tests/scripts/list-provider-models.bats'

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/list-provider-models.sh"
  BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$BIN"
  export ARGV_LOG="$BATS_TEST_TMPDIR/argv" SEEN_AUTH="$BATS_TEST_TMPDIR/seen"
  : >"$ARGV_LOG"; : >"$SEEN_AUTH"
  cat >"$BIN/curl" <<'FAKE'
#!/bin/sh
printf '%s\n' "$*" >>"$ARGV_LOG"
prev=""
for arg; do
  case "$prev" in -H) case "$arg" in @*) cat "${arg#@}" >>"$SEEN_AUTH" ;; esac ;; esac
  prev="$arg"; url="$arg"
done
case "$url" in
*alpha.invalid/v1/models) printf '{"data":[{"id":"alpha/one","owned_by":"x"},{"id":"alpha/two"}]}' ;;
*beta.invalid/v1/models) printf '{"data":[{"id":"beta-1"}]}' ;;
*) exit 22 ;;
esac
FAKE
  chmod +x "$BIN/curl"
  PATH="$BIN:$PATH"
  export SECRET_VALUE="sk-test-SECRET-123"
  export OSIONOS_AI_KEY_ALPHA="$SECRET_VALUE"
  unset OSIONOS_AI_KEY_BETA
  export OSIONOS_AI_PLATFORM_PROVIDERS='[
    {"id":"alpha","baseUrl":"https://alpha.invalid/v1","apiKeyEnv":"OSIONOS_AI_KEY_ALPHA","wire":"openai-compatible","models":[{"id":"a","label":"A","upstreamId":"alpha/one","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0}]},
    {"id":"beta","baseUrl":"https://beta.invalid/v1","apiKeyEnv":"OSIONOS_AI_KEY_BETA","wire":"openai-compatible","models":[{"id":"b","label":"B","upstreamId":"beta-1","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0}]}
  ]'
}

@test "prints ids only: provider<TAB>id, nothing else on stdout" {
  run --separate-stderr bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'alpha\talpha/one\nalpha\talpha/two')" ]
}

@test "key never in argv or output; it reaches curl through a header file" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  ! grep -q "$SECRET_VALUE" "$ARGV_LOG"
  [[ "$output" != *"$SECRET_VALUE"* ]]
  grep -q "Authorization: Bearer $SECRET_VALUE" "$SEEN_AUTH"
}

@test "missing key: provider skipped with its id on stderr, others still listed" {
  run --separate-stderr bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$stderr" == *"skip beta"* ]]
  [[ "$output" != *"beta"* ]]
  [[ "$output" == *"alpha/one"* ]]
}

@test "keyless provider (no apiKeyEnv) is listed with no auth header" {
  export OSIONOS_AI_PLATFORM_PROVIDERS='[{"id":"beta","baseUrl":"https://beta.invalid/v1","wire":"openai-compatible","models":[{"id":"b","label":"B","upstreamId":"beta-1","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0}]}]'
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'beta\tbeta-1')" ]
  [ ! -s "$SEEN_AUTH" ]
}

@test "--env-file is parsed as KEY=VALUE and never sourced" {
  unset OSIONOS_AI_KEY_ALPHA
  F="$BATS_TEST_TMPDIR/env"
  printf 'OSIONOS_AI_KEY_ALPHA=%s\ntouch %s/pwned\n$(touch %s/pwned2)=1\n' "$SECRET_VALUE" "$BATS_TEST_TMPDIR" "$BATS_TEST_TMPDIR" >"$F"
  run bash "$SCRIPT" --env-file "$F"
  [ "$status" -eq 0 ]
  [ ! -e "$BATS_TEST_TMPDIR/pwned" ]
  [ ! -e "$BATS_TEST_TMPDIR/pwned2" ]
  grep -q "Authorization: Bearer $SECRET_VALUE" "$SEEN_AUTH"
}
