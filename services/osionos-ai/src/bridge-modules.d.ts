/**
 * The bridge's app-session token module and its session-cutoff module live at the
 * repository root (scripts/), outside this service. The service imports them; it
 * never copies them.
 *
 * The type-check gate mounts ONLY services/osionos-ai, so from tsc the two modules
 * are unreachable and a relative import of them fails to resolve. These ambient
 * declarations give the imports their shape; at runtime the very same import
 * specifiers resolve the real files, so the behaviour is the bridge's.
 */

interface OsionosSessionCutoffTracker {
	enforced: boolean;
	status(): string;
	cutoffMicros(userId: string): number | undefined;
}

declare module '*scripts/bridge-session-token.mjs' {
	export interface AppSessionConfig {
		appSessionSecret: string;
		sessionTtlSeconds: number;
		sessionCutoffs?: OsionosSessionCutoffTracker;
	}
	export interface AppSessionWorkspace {
		_id: string;
	}
	export interface AppSessionMemberWorkspace {
		_id: string;
		role: string;
	}
	export interface SignedAppSessionToken {
		token: string;
		expiresAt: string;
	}
	export interface VerifiedAppSessionToken {
		userId: string;
		workspaceIds: string[];
		roles: Record<string, string>;
		isAdmin: boolean;
		raw: Record<string, unknown>;
	}
	export function signAppSessionToken(options: {
		payload: { subject: string; provider: string };
		workspace: AppSessionWorkspace;
		config: AppSessionConfig;
		now?: number;
		jti?: string;
		memberWorkspaces?: AppSessionMemberWorkspace[];
		isAdmin?: boolean;
	}): SignedAppSessionToken;
	export function verifyAppSessionToken(token: string, config: AppSessionConfig, now?: number): VerifiedAppSessionToken;
}

declare module '*scripts/bridge-session-cutoff.mjs' {
	export function sessionCutoffsFromConfig(
		config: { sessionCutoffsMode?: string; serviceKey?: string; baasUrl?: string },
		options?: { now?: () => number; log?: { info: (message: string) => void; warn: (message: string) => void } },
	): OsionosSessionCutoffTracker;
	export function startSessionCutoffPoller(
		tracker: OsionosSessionCutoffTracker,
		source: { fetchImpl?: typeof fetch; baasUrl: string; serviceKey: string },
		options?: { intervalMs?: number; timeoutMs?: number },
	): { tick(): Promise<void>; stop(): void };
}

declare module '*scripts/bridge-page-read.mjs' {
	/**
	 * The read rule of a page for a member of its workspace. The row carries the
	 * raw columns: workspace_id, visibility, owner_id and collaborators.
	 */
	export function canReadPageRowAsMember(
		row:
			| {
					workspace_id?: unknown;
					visibility?: unknown;
					owner_id?: unknown;
					collaborators?: unknown;
			  }
			| null
			| undefined,
		userId: string,
		memberWorkspaceIds: readonly string[],
	): boolean;
}
