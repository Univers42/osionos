/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-guard.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Request guards for the account plane: client metadata, fixed-window throttling,
 * per-session sudo and the audit write that must land before an irreversible action.
 *
 * `pg` is injected with the `createPg` shape of `bridge-pg.mjs` (which may not be merged
 * in every worktree); tests pass a fake exposing `asService()`. The audit columns come
 * from `models/osionos-bridge-migration.sql:128` plus the four P0-1 adds (`actor_id`,
 * `session_id`, `ip_hash`, `user_agent`).
 *
 * Only ONE configured header may name the client address: in both deployments the socket
 * peer is a proxy (nginx.conf:44 sets X-Real-IP; production comes through Vercel,
 * vercel.json:8), so a socket fallback would put every user in one /24. The left-most
 * X-Forwarded-For entry is attacker-controlled (`bridge-public.mjs:27`) and never read.
 */

import { createHmac } from 'node:crypto';
import net from 'node:net';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const MAX_USER_AGENT_CODE_POINTS = 256;
const MAX_DETAILS_BYTES = 2_048;
const SUDO_MESSAGE = 'Sudo is required for this action.';
const AUDIT_MESSAGE = 'The audit log is unavailable.';

function guardError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

// A header that arrives as an array is a duplicate: one value is the address, several are
// not a single address and yield nothing.
function headerText(value) {
	if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
	return value;
}

function headerValue(headers, name) {
	const wanted = name.toLowerCase();
	const direct = headers?.[wanted];
	if (direct !== undefined) return headerText(direct);
	for (const [key, value] of Object.entries(headers ?? {})) {
		if (key.toLowerCase() !== wanted) continue;
		return headerText(value);
	}
	return undefined;
}

function expandIpv6(text) {
	const source = text.toLowerCase();
	const doubleAt = source.indexOf('::');
	const head = doubleAt === -1 ? source : source.slice(0, doubleAt);
	const tail = doubleAt === -1 ? '' : source.slice(doubleAt + 2);
	const groupsOf = (part) => {
		if (part === '') return [];
		const groups = [];
		for (const group of part.split(':')) {
			if (group.includes('.')) {
				const octets = group.split('.').map(Number);
				if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
				groups.push(((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16));
			} else {
				if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
				groups.push(group);
			}
		}
		return groups;
	};
	const headGroups = groupsOf(head);
	const tailGroups = groupsOf(tail);
	if (!headGroups || !tailGroups) return null;
	const total = headGroups.length + tailGroups.length;
	if (doubleAt === -1) return total === 8 ? headGroups : null;
	if (source.indexOf('::', doubleAt + 2) !== -1 || total > 7) return null;
	return [...headGroups, ...Array(8 - total).fill('0'), ...tailGroups];
}

function canonicalIpv6(groups) {
	try {
		return new URL(`http://[${groups.join(':')}]`).hostname.slice(1, -1);
	} catch {
		return null;
	}
}

function addressInfo(raw) {
	if (typeof raw !== 'string') return null;
	const text = raw.trim().split('%')[0];
	if (!text || text.includes(',')) return null;
	const family = net.isIP(text);
	if (family === 4) {
		const [a, b, c] = text.split('.');
		return { address: text, prefix: `${a}.${b}.${c}.0/24` };
	}
	if (family !== 6) return null;
	const groups = expandIpv6(text);
	if (!groups) return null;
	if (groups.slice(0, 5).every((group) => Number.parseInt(group, 16) === 0) && Number.parseInt(groups[5], 16) === 0xffff) {
		const high = Number.parseInt(groups[6], 16);
		const low = Number.parseInt(groups[7], 16);
		const address = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
		return { address, prefix: address.split('.').slice(0, 3).join('.') + '.0/24' };
	}
	const masked = groups.map((group, index) => (index < 3 ? Number.parseInt(group, 16) : 0));
	const canonical = canonicalIpv6(groups);
	const prefixHost = canonicalIpv6(masked.map((group) => group.toString(16)));
	if (!canonical || !prefixHost) return null;
	return { address: canonical, prefix: `${prefixHost}/48` };
}

// Caveat: truncation keeps the first 256 code points, so a client whose UA differs only
// after that point is indistinguishable from a longer one (the column's own limit).
function userAgentOf(headers) {
	const raw = headerValue(headers, 'user-agent');
	if (raw === undefined || raw === null) return null;
	const text = Array.isArray(raw) ? raw.join(', ') : String(raw);
	return Array.from(text.replace(CONTROL_CHARS, '')).slice(0, MAX_USER_AGENT_CODE_POINTS).join('');
}

// Caveat: a /24 (or /48) bucket also groups unrelated clients behind one NAT, so a
// throttled prefix can deny a bystander; the alternative stores a raw IP, which P0-1 bans.
/**
 * `ipPrefix` is the /24 (IPv4) or /48 (IPv6) form the `osionos_sessions.cidr` column
 * accepts; `ipHash` is a keyed HMAC so a leaked table cannot be reversed offline. The raw
 * address is never returned or logged. A blank secret yields no hash, never an unkeyed one
 * (all of IPv4 hashes in seconds).
 */
export function clientMeta(request, { ipHeader, hashSecret } = {}) {
	const header = typeof ipHeader === 'string' && ipHeader.trim() !== '' ? ipHeader.trim() : '';
	const raw = header
		? headerValue(request?.headers, header)
		: request?.socket?.remoteAddress ?? null;
	const info = addressInfo(raw);
	const secret = typeof hashSecret === 'string' ? hashSecret : '';
	const ipHash = info && secret.trim() !== ''
		? createHmac('sha256', secret).update(`osb:ip:${info.address}`).digest('hex')
		: null;
	return {
		ipPrefix: info?.prefix ?? null,
		ipHash,
		userAgent: userAgentOf(request?.headers),
	};
}

function checkedParts(parts) {
	if (!Array.isArray(parts) || parts.length === 0) throw new TypeError('rate-limit parts must be a non-empty array.');
	if (parts.some((part) => typeof part !== 'string' || part === '')) {
		throw new TypeError('every rate-limit part must be a non-empty string.');
	}
	return `rl:${parts.map(encodeURIComponent).join(':')}`;
}

// Caveat: a fixed window lets 2 × limit through across a boundary, and retryAfterSeconds
// is the whole window, not the time actually left. Inside one process the counter is
// serialized by the kv store, so concurrent requests cannot both see the same count.
export async function rateLimit(kv, parts, { limit, windowMs } = {}) {
	const key = checkedParts(parts);
	if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
		throw new TypeError('rate limit needs a positive integer limit and windowMs.');
	}
	const count = await kv.incrWithTtl(key, windowMs);
	if (count > limit) {
		throw Object.assign(guardError(429, 'rate_limited', 'Too many requests.'), {
			retryAfterSeconds: Math.ceil(windowMs / 1_000),
		});
	}
}

function sessionJti(session) {
	const jti = session?.raw?.jti;
	return typeof jti === 'string' && UUID_PATTERN.test(jti) ? jti.toLowerCase() : null;
}

/** The grant lives under `sudo:<jti>`, so sudo on one device never unlocks another. */
export async function grantSudo(kv, session, ttlMs = 600_000) {
	if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new TypeError('sudo ttlMs must be a positive integer.');
	const jti = sessionJti(session);
	const userId = session?.userId;
	if (!jti || typeof userId !== 'string' || userId === '') throw guardError(403, 'sudo_required', SUDO_MESSAGE);
	await kv.set(`sudo:${jti}`, userId, ttlMs);
}

export async function requireSudo(kv, session) {
	const jti = sessionJti(session);
	const userId = session?.userId;
	if (!jti || typeof userId !== 'string' || userId === '') throw guardError(403, 'sudo_required', SUDO_MESSAGE);
	const granted = await kv.get(`sudo:${jti}`);
	if (typeof granted !== 'string' || granted !== userId) throw guardError(403, 'sudo_required', SUDO_MESSAGE);
}

// Caveat: the cap is measured on the JSON text before Postgres sees it; huge shared
// references are bounded, but the producer can still spend CPU serialising them.
function assertDetails(details) {
	if (details === null || typeof details !== 'object' || Array.isArray(details)) {
		throw new TypeError('audit details must be a plain object.');
	}
	const prototype = Object.getPrototypeOf(details);
	if (prototype !== Object.prototype && prototype !== null) throw new TypeError('audit details must be a plain object.');
	let encoded;
	try {
		encoded = JSON.stringify(details);
	} catch {
		throw new TypeError('audit details must be JSON-serialisable.');
	}
	if (Buffer.byteLength(encoded) > MAX_DETAILS_BYTES) throw new TypeError('audit details are too large.');
}

/**
 * Insert one audit row BEFORE the irreversible action: no audit row, no action. The row
 * records an ATTEMPT — the action may still fail after it. `details` never carries a
 * token, secret, password or verification code.
 */
export async function writeAudit(pg, { session, meta, eventType, details = {} } = {}) {
	const userId = session?.userId;
	if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) throw new TypeError('audit subject must be a UUID.');
	if (typeof eventType !== 'string' || eventType.trim() === '') throw new TypeError('audit eventType must be a non-empty string.');
	assertDetails(details);
	const row = {
		provider: 'osionos',
		subject: userId,
		actor_id: userId,
		session_id: sessionJti(session),
		ip_hash: meta?.ipHash ?? null,
		user_agent: meta?.userAgent ?? null,
		event_type: eventType,
		details,
	};
	try {
		// asService throws synchronously when the account plane is unconfigured.
		const client = pg.asService();
		await client.post('osionos_bridge_audit_events', row, { prefer: 'return=minimal' });
	} catch (error) {
		throw Object.assign(guardError(503, 'audit_unavailable', AUDIT_MESSAGE), { cause: error });
	}
}
