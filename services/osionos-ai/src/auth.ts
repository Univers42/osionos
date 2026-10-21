import type { IncomingMessage } from 'node:http';
import { verifyAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import type { VerifiedAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { sessionCutoffsFromConfig, startSessionCutoffPoller } from '../../../scripts/bridge-session-cutoff.mjs';
import type { SessionCutoffTracker } from '../../../scripts/bridge-session-cutoff.mjs';
import { config } from './config.ts';

export interface AuthUser {
	userId: string;
	workspaceId: string;
	memberWorkspaces: { id: string; role: string }[];
	isAdmin: boolean;
}

/**
 * The cut-off tracker of this process: the bridge keeps one per server and hangs it
 * off its config (scripts/bridge-api.mjs:4126-4131). The same object goes into the
 * token config, so a token issued before its user's sign-out is refused.
 */
const sessionCutoffs: SessionCutoffTracker = sessionCutoffsFromConfig(config);
const tokenConfig = { ...config, sessionCutoffs };

/**
 * The poller starts once, at boot, exactly like the bridge starts it on its
 * 'listening' event (scripts/bridge-api.mjs:4183-4185). It is the only thing this
 * service asks of the BaaS.
 */
export const cutoffPoller = startSessionCutoffPoller(sessionCutoffs, {
	fetchImpl: fetch,
	baasUrl: config.baasUrl,
	serviceKey: config.serviceKey,
});

/** The bearer token of a request, or null when there is none (the bridge: :406-411). */
export function bearerToken(request: IncomingMessage): string | null {
	const header = String(request.headers.authorization ?? '');
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match ? match[1].trim() : null;
}

/** The verified token as the service's user: the owner workspace, the rest, the flag. */
function toAuthUser(verified: VerifiedAppSessionToken): AuthUser {
	// The bridge signs the private workspace with the role "owner" and the member
	// workspaces with theirs (scripts/bridge-session-token.mjs:37-45).
	const workspaceId = verified.workspaceIds.find((id) => verified.roles[id] === 'owner') ?? verified.workspaceIds[0] ?? '';
	const memberWorkspaces = verified.workspaceIds
		.filter((id) => id !== workspaceId)
		.map((id) => ({ id, role: verified.roles[id] ?? 'member' }));
	return { userId: verified.userId, workspaceId, memberWorkspaces, isAdmin: verified.isAdmin };
}

/** The failure's code and status; the token itself never reaches the log. */
function failureCode(error: unknown): { status: number; code: string } {
	const candidate = error as { status?: unknown; code?: unknown } | null;
	return {
		status: typeof candidate?.status === 'number' ? candidate.status : 0,
		code: typeof candidate?.code === 'string' ? candidate.code : 'unauthorized',
	};
}

/**
 * The caller of a request, and the code of its refusal.
 *
 * Any verification failure is a refusal: the caller sees a 401 with the code (a
 * session the cut-off refuses says `session_revoked`, every other failure says
 * `unauthorized`), and the log sees the code too.
 */
export function verifyRequest(request: IncomingMessage): { user: AuthUser | null; code: string | null } {
	const token = bearerToken(request);
	if (!token) return { user: null, code: null };
	try {
		return { user: toAuthUser(verifyAppSessionToken(token, tokenConfig)), code: null };
	} catch (error) {
		const failure = failureCode(error);
		console.warn(JSON.stringify({ event: 'auth_failed', status: failure.status, code: failure.code }));
		return { user: null, code: failure.code };
	}
}

/** The caller of a request, or null when the request carries no valid app-session token. */
export function authenticate(request: IncomingMessage): AuthUser | null {
	return verifyRequest(request).user;
}

/**
 * Puts another cut-off tracker in place of the one the poller fills.
 *
 * The suite runs with OSIONOS_SESSION_CUTOFFS=off, so the tracker of this
 * process never enforces anything and no test could see a revoked token. A
 * test that needs one hands a tracker here, loaded with the cut-off it wants.
 * The service itself never calls this: the poller above owns the tracker.
 */
export function setSessionCutoffs(tracker: SessionCutoffTracker): void {
	tokenConfig.sessionCutoffs = tracker;
}
