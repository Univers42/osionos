#!/bin/sh
# shellcheck shell=sh
# Shared by the operator scripts (list-provider-models.sh, bench/rank-pool.sh):
# read an env file WITHOUT sourcing it, and hand a provider key to curl or docker
# through a mode-600 header file, never through argv.
#
# Caveat: the env-file parser takes plain KEY=VALUE lines (optional surrounding
# quotes). `export`, multi-line values and command substitution are not
# understood: such a line is ignored, so a key written that way reads as unset.
# Only OSIONOS_AI_* names are loaded, and a variable already in the environment wins.

# The two public functions run with xtrace off and restore it after: under
# `bash -x` the expanded key would otherwise be printed by the trace.
_xtrace_off() {
	case $- in *x*) _XTRACE_WAS_ON=1 ;; *) _XTRACE_WAS_ON=0 ;; esac
	{ set +x; } 2>/dev/null
}
_xtrace_restore() {
	if [ "$_XTRACE_WAS_ON" = 1 ]; then set -x; fi
}

# load_env_file <file>
load_env_file() {
	_xtrace_off
	_load_env_file "$1"
	_rc=$?
	_xtrace_restore
	return "$_rc"
}
_load_env_file() {
	[ -r "$1" ] || { echo "env file not readable: $1" >&2; return 1; }
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in
		OSIONOS_AI_[A-Z0-9_]*=*) ;;
		*) continue ;;
		esac
		name=${line%%=*}
		value=${line#*=}
		case "$name" in *[!A-Z0-9_]*) continue ;; esac
		case "$value" in
		\"*\") value=${value#\"}; value=${value%\"} ;;
		\'*\') value=${value#\'}; value=${value%\'} ;;
		esac
		eval "[ -n \"\${$name:-}\" ]" || export "$name=$value"
	done <"$1"
}

# write_auth_header <env var name> <file>: 0 when the key is set and non-empty.
# The name is checked before the indirect read so it cannot carry code.
write_auth_header() {
	_xtrace_off
	_write_auth_header "$1" "$2"
	_rc=$?
	_xtrace_restore
	return "$_rc"
}
_write_auth_header() {
	case "$1" in
	OSIONOS_AI_KEY_*[!A-Z0-9_]* | OSIONOS_AI_KEY_) return 1 ;;
	OSIONOS_AI_KEY_* | OSIONOS_AI_UPSTREAM_API_KEY) ;;
	*) return 1 ;;
	esac
	eval "key=\${$1:-}"
	[ -n "$key" ] || return 1
	( umask 077; : >"$2" )
	printf 'Authorization: Bearer %s\n' "$key" >"$2"
	key=
}
