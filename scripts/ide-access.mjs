// Who may open an IDE sandbox: OSIONOS_IDE_ACCESS picks the rule, on the host bridge (mint) and on
// the plane (every route and socket) alike. The plane is DB-less on purpose (ide-server.mjs), so its
// part is the synchronous `assertIdeSubject`; only the host mint adds the bounded BaaS lookup.
//
//   allowlist  (default) the env list OSIONOS_IDE_ALLOWED_SUBJECTS, nothing else, no query
//   approved   an operator-set row in public.osionos_ide_access (approved_at set, disabled_at null)
//   verified   a confirmed email AND not disabled. Code only: turning it on in public is BLOCKED
//              (verdict B1.L1-L7; under GoTrue autoconfirm "verified" means "anyone")
//   off        refuses every token whatever the host says: the plane's kill switch
//
// approved and verified are decided on the host; the plane then trusts the token's signature and
// re-checks only its own mode plus OSIONOS_IDE_DENIED_SUBJECTS (a per-user disable that needs no DB).
//
// Caveat: a disable takes effect on the host within one token TTL (15 min, nothing is revoked) and on
// the plane when OSIONOS_IDE_DENIED_SUBJECTS changes and the plane is recreated. An unknown mode
// is logged once per distinct value and behaves as an empty allowlist, so a typo refuses everyone
// instead of admitting them.

import { rest } from './bridge-social-core.mjs';
import { withinBound } from './ide-username.mjs';

export const IDE_ACCESS_LOOKUP_TIMEOUT_MS = 1500;
const MODES = new Set(['allowlist', 'approved', 'verified', 'off']);
const warnedValues = new Set();

const notAllowed = () => Object.assign(new Error('The IDE is not enabled for this account.'), { status: 403, code: 'not-allowed' });

const subjectList = (raw) => String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** `refuseAll` is set for an unrecognised value: the mode is allowlist and the list is treated as empty. */
export function resolveAccessMode(env) {
  const raw = String(env?.OSIONOS_IDE_ACCESS ?? '').trim();
  if (raw === '') return { mode: 'allowlist', refuseAll: false };
  if (MODES.has(raw)) return { mode: raw, refuseAll: false };
  if (!warnedValues.has(raw)) {
    warnedValues.add(raw);
    console.warn(`[osionos-ide] OSIONOS_IDE_ACCESS="${raw.slice(0, 24)}" is not allowlist|approved|verified|off; refusing every account`);
  }
  return { mode: 'allowlist', refuseAll: true };
}

/** The synchronous gate, identical on host and plane. Throws 403 `not-allowed`. */
export function assertIdeSubject(userId, env) {
  const { mode, refuseAll } = resolveAccessMode(env);
  const subject = String(userId).toLowerCase();
  if (mode === 'off' || refuseAll) throw notAllowed();
  if (mode === 'allowlist') {
    if (!subjectList(env?.OSIONOS_IDE_ALLOWED_SUBJECTS).includes(subject)) throw notAllowed();
    return;
  }
  if (subjectList(env?.OSIONOS_IDE_DENIED_SUBJECTS).includes(subject)) throw notAllowed();
}

async function readAccessRow(config, fetchImpl, userId) {
  const rows = await rest(config, fetchImpl, `osionos_ide_access?user_id=eq.${userId}&select=approved_at,disabled_at&limit=1`);
  return Array.isArray(rows) ? rows[0] : undefined;
}

async function readEmailConfirmedAt(config, fetchImpl, userId) {
  const response = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users/${userId}`, {
    headers: { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
    signal: AbortSignal.timeout(IDE_ACCESS_LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GoTrue answered ${response.status}`);
  return (await response.json())?.email_confirmed_at ?? null;
}

async function isApproved(config, fetchImpl, userId, mode) {
  const row = await readAccessRow(config, fetchImpl, userId);
  if (row?.disabled_at) return false;
  if (mode === 'approved') return Boolean(row?.approved_at);
  return Boolean(await readEmailConfirmedAt(config, fetchImpl, userId));
}

/** The host's second step, after `assertIdeSubject`: throws `not-allowed` unless the mode's row says yes.
 *  Any lookup error or timeout is a no, so a BaaS outage closes the IDE instead of opening it. */
export async function requireIdeApproval(config, fetchImpl, userId, env, timeoutMs = IDE_ACCESS_LOOKUP_TIMEOUT_MS) {
  const { mode } = resolveAccessMode(env);
  if (mode !== 'approved' && mode !== 'verified') return;
  let allowed = false;
  try {
    allowed = await withinBound(() => isApproved(config, fetchImpl, userId, mode), timeoutMs, 'ide access lookup');
  } catch {
    allowed = false;
  }
  if (!allowed) throw notAllowed();
}
