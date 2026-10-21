import type { IncomingMessage } from 'node:http';
import { verifyAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import type { VerifiedAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { privateWorkspaceOf } from '../../../scripts/bridge-live-workspaces.mjs';
import { sessionCutoffsFromConfig, startSessionCutoffPoller } from '../../../scripts/bridge-session-cutoff.mjs';
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
const sessionCutoffs = sessionCutoffsFromConfig(config);
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
	// workspaces with theirs (scripts/bridge-session-token.mjs:37-45). The private
	// workspace is the one the shared rule counts (scripts/bridge-live-workspaces.mjs).
	const workspaceId = privateWorkspaceOf(verified);
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
 * The caller of a request, or null when the request carries no valid app-session
 * token. Any verification failure is a refusal: the caller sees a 401, the log sees
 * the failure's code.
 */
export function authenticate(request: IncomingMessage): AuthUser | null {
	const token = bearerToken(request);
	if (!token) return null;
	try {
		return toAuthUser(verifyAppSessionToken(token, tokenConfig));
	} catch (error) {
		const failure = failureCode(error);
		console.warn(JSON.stringify({ event: 'auth_failed', status: failure.status, code: failure.code }));
		return null;
	}
}
