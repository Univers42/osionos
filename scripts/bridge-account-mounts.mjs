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
 */

import { createSessionsRoutes } from './bridge-sessions.mjs';
import { createAvatarRoutes } from './bridge-avatar.mjs';

export function createAccountHandler(deps) {
	const modules = [createSessionsRoutes(deps), createAvatarRoutes(deps)];
	return async function handleAccountRequest(url, request, response) {
		for (const module of modules) {
			if (await module(url, request, response)) return true;
		}
		return false;
	};
}
