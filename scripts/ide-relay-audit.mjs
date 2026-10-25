// One JSON line per operation on stdout (contract 10), read with `docker logs | jq`. The field list
// per op is an allowlist: a DATA payload, a token, a nonce or a hostname handed in by mistake is
// dropped here, so INV-5 does not depend on every caller remembering it.
//
// Caveat: a line is written when the operation completes, so a process killed mid-operation leaves
// none. Retention is the docker log driver's.

export const AUDIT_FIELDS = Object.freeze({
	pair_start: ['pair', 'fp', 'platform', 'version', 'ip', 'status'],
	pair_claim: ['subj', 'pair', 'status'],
	pair_confirm: ['subj', 'pair', 'fp', 'status'],
	pair_accept: ['subj', 'pair', 'agent', 'fp', 'status'],
	connect: ['agent', 'subj', 'fp', 'version', 'ip', 'status'],
	auth_fail: ['agent', 'ip', 'reason'],
	disconnect: ['agent', 'subj', 'code', 'dur_s'],
	session_open: ['subj', 'agent', 'ch', 'term', 'kind', 'status'],
	session_close: ['subj', 'agent', 'ch', 'code', 'dur_s', 'bytes_up', 'bytes_down'],
	bytes: ['subj', 'agent', 'ch', 'bytes_up', 'bytes_down', 'window_s'],
	revoke: ['subj', 'agent', 'by', 'dropped', 'ms_to_drop', 'persisted'],
	rotate: ['subj', 'agent', 'fp_old', 'fp_new', 'status'],
});

export function createAudit({ write = (text) => process.stdout.write(text), now = Date.now } = {}) {
	return function audit(op, fields = {}) {
		if (!Object.hasOwn(AUDIT_FIELDS, op)) throw new Error(`unknown audit op ${op}`);
		const line = { ts: new Date(now()).toISOString(), op };
		for (const key of AUDIT_FIELDS[op]) line[key] = fields[key] ?? null;
		write(`${JSON.stringify(line)}\n`);
	};
}
