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
import { createPreferencesRoutes } from './bridge-preferences.mjs';
import { createSessionsRoutes } from './bridge-sessions.mjs';
import { createPublishedPagesRoutes } from './bridge-account-published-pages.mjs';
import { createAvatarRoutes } from './bridge-avatar.mjs';
import { createSelfDataRoutes } from './bridge-self-data.mjs';
import { createWorkspaceSettingsRoutes } from './bridge-workspace-settings.mjs';
import { createAdminUsersRoutes } from './bridge-account-users.mjs';
import { createAdminAuditRoutes } from './bridge-account-audit.mjs';
import { createAdminModerationRoutes } from './bridge-account-moderation.mjs';

export function createAccountHandler(deps) {
	const modules = [
		createSessionsRoutes(deps),
		createAccountProfileRoutes(deps),
		createPreferencesRoutes(deps),
		createPublishedPagesRoutes(deps),
		createAvatarRoutes(deps),
		createAccountSudoRoutes({ ...deps, env: deps.env ?? process.env }),
		createAccountIdentityRoutes(deps),
		createSelfDataRoutes(deps),
		createWorkspaceSettingsRoutes(deps),
		createPatRoutes(deps),
		createAdminUsersRoutes(deps),
		createAdminAuditRoutes(deps),
		createAdminModerationRoutes(deps),
		createAccountStatusRoutes(deps),
	];
	return async function handleAccountRequest(url, request, response) {
		for (const module of modules) {
			if (await module(url, request, response)) return true;
		}
		return false;
	};
}
