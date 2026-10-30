/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mounts.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one seam the account-plane route modules mount through. bridge-api.mjs holds a single
 * `account:` entry and a single dispatch line; every later package appends its module to the
 * list below and never touches bridge-api.mjs again.
 *
 * Each module answers true when it handled the request and false when the path is not
 * its own, so the order is the order of the paths.
 *
 * The sudo module also takes the environment and the OTP transport: it reads the
 * JWT_SECRET the proof is signed with, and it calls grobase's login-OTP service and
 * GoTrue's admin route — neither of which is the PostgREST the other modules speak.
 */

import { createAccountIdentityRoutes } from './bridge-account-identity.mjs';
import { createAccountProfileRoutes } from './bridge-account-profile.mjs';
import { createAccountStatusRoutes } from './bridge-account-status.mjs';
import { createAccountSudoRoutes } from './bridge-account-sudo.mjs';
import { createPatRoutes } from './bridge-account-tokens.mjs';
import { createAccountKeysRoutes } from './bridge-account-keys.mjs';
import { createPreferencesRoutes } from './bridge-preferences.mjs';
import { createSessionsRoutes } from './bridge-sessions.mjs';
import { createPublishedPagesRoutes } from './bridge-account-published-pages.mjs';
import { createAvatarRoutes } from './bridge-avatar.mjs';
import { createSelfDataRoutes } from './bridge-self-data.mjs';
import { createSelfViewsRoutes } from './bridge-self-views.mjs';
import { createWorkspaceSettingsRoutes } from './bridge-workspace-settings.mjs';
import { createLibraryViewsRoutes } from './bridge-library-views.mjs';
import { createWorkspaceLifecycleRoutes } from './bridge-workspace-lifecycle.mjs';
import { createWorkspaceTeamsRoutes } from './bridge-workspace-teams.mjs';
import { createAdminUsersRoutes } from './bridge-account-users.mjs';
import { createAdminAuditRoutes } from './bridge-account-audit.mjs';
import { createAdminInsightsRoutes } from './bridge-account-insights.mjs';
import { createAdminModerationRoutes } from './bridge-account-moderation.mjs';
import { createMfaRoutes } from './bridge-account-mfa.mjs';
import { createMfaRecoveryRoutes } from './bridge-account-mfa-recovery.mjs';
import { createAccountPasswordRoutes } from './bridge-account-password.mjs';
import { createAccountExportRoutes } from './bridge-account-export.mjs';
import { createAccountErasureRunner } from './bridge-account-erasure.mjs';
import { createPasskeyRoutes } from './bridge-account-passkeys.mjs';
import { createAccountIdentitiesRoutes } from './bridge-account-identities.mjs';
import { createAccountSettingsRoutes } from './bridge-account-settings.mjs';
import { createAccountEmailsRoutes } from './bridge-account-emails.mjs';

export function createAccountHandler(deps) {
	const modules = [
		createSessionsRoutes(deps),
		createAccountProfileRoutes(deps),
		createPreferencesRoutes(deps),
		createPublishedPagesRoutes(deps),
		createAvatarRoutes(deps),
		createAccountSudoRoutes({ ...deps, env: deps.env ?? process.env }),
		createAccountIdentityRoutes(deps),
		createAccountPasswordRoutes(deps),
		createSelfDataRoutes(deps),
		createSelfViewsRoutes(deps),
		createWorkspaceSettingsRoutes(deps),
		createLibraryViewsRoutes(deps),
		createWorkspaceLifecycleRoutes(deps),
		createWorkspaceTeamsRoutes(deps),
		createPatRoutes(deps),
		createAccountKeysRoutes(deps),
		createAdminUsersRoutes(deps),
		createAdminAuditRoutes(deps),
		createAdminInsightsRoutes({ ...deps, env: deps.mfaEnv ?? process.env }),
		createAdminModerationRoutes(deps),
		createAccountStatusRoutes(deps),
		createMfaRoutes({ config: deps.config, pg: deps.pg, kv: deps.kv, verifySession: deps.verifySession, env: deps.mfaEnv ?? process.env, fetchImpl: deps.mfaFetch ?? fetch, now: deps.mfaNow ?? null }),
		createMfaRecoveryRoutes({ config: deps.config, pg: deps.pg, kv: deps.kv, verifySession: deps.verifySession, env: deps.mfaEnv ?? process.env, now: deps.mfaNow ?? null }),
		createAccountExportRoutes({ config: deps.config, pg: deps.pg, kv: deps.kv, verifySession: deps.verifySession, env: deps.exportEnv ?? process.env, fetchImpl: deps.exportFetch ?? fetch, now: deps.exportNow ?? Date.now, runner: deps.exportRunner !== false }),
		createPasskeyRoutes({ config: deps.config, pg: deps.pg, verifySession: deps.verifySession, env: deps.mfaEnv ?? process.env }),
		createAccountIdentitiesRoutes({ config: deps.config, verifySession: deps.verifySession, fetchImpl: deps.mfaFetch ?? fetch }),
		createAccountSettingsRoutes({ config: deps.config, pg: deps.pg, kv: deps.kv, verifySession: deps.verifySession, env: deps.mfaEnv ?? process.env }),
		createAccountEmailsRoutes({ config: deps.config, pg: deps.pg, kv: deps.kv, verifySession: deps.verifySession, env: deps.mfaEnv ?? process.env, fetchImpl: deps.mfaFetch ?? fetch, now: deps.mfaNow ?? null, track: deps.emailTrack ?? undefined }),
	];
	// Off unless OSIONOS_ACCOUNT_DELETION_EXECUTOR=1 (and, in production, a dry run or a verdict).
	createAccountErasureRunner({ config: deps.config, pg: deps.pg, kv: deps.kv, fetchImpl: deps.erasureFetch ?? deps.mfaFetch ?? fetch, env: deps.erasureEnv ?? deps.mfaEnv ?? process.env }).start();
	return async function handleAccountRequest(url, request, response, requestConfig = deps.config) {
		if (requestConfig.allowedOrigin !== deps.config.allowedOrigin) answerWithOrigin(response, requestConfig.allowedOrigin);
		for (const module of modules) {
			if (await module(url, request, response)) return true;
		}
		return false;
	};
}

// The modules above are built once with the bridge's static config, so every reply they
// write names its default origin; a desktop (app://osionos) or localhost caller then has
// its Settings reads discarded by the browser (2026-10-30). This makes their CORS origin
// header the one the bridge allowed for this request, wherever a module sets it.
function answerWithOrigin(response, origin) {
	const isOriginHeader = (name) => String(name).toLowerCase() === 'access-control-allow-origin';
	const setHeader = response.setHeader.bind(response);
	response.setHeader = (name, value) => setHeader(name, isOriginHeader(name) ? origin : value);
	const writeHead = response.writeHead.bind(response);
	response.writeHead = (status, ...rest) => {
		for (const headers of rest) {
			if (!headers || typeof headers !== 'object' || Array.isArray(headers)) continue;
			for (const name of Object.keys(headers)) if (isOriginHeader(name)) headers[name] = origin;
		}
		return writeHead(status, ...rest);
	};
}
