/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// NOTE: the account-wide data-source provider is registered as a side effect of
// DatabaseBlock.tsx / WorkspaceDatabaseBlock.tsx (which import
// './model/dataSourceProvider' directly). It is intentionally NOT imported here:
// a bare barrel side-effect would statically pull knownDatabaseState + the
// ~458KB seed JSON onto every barrel consumer (incl. warm paths). A Source
// picker is only reachable once a DB block has mounted, so the provider is
// always registered by the time it is needed.

export * from './ui/DatabaseBlock';
export * from './ui/WorkspaceDatabaseBlock';
export * from './model/databaseViewCatalog';
export * from './model/workspaceDatabaseConstants';
export * from './model/workspaceNav';
export * from './model/workspaceDatabasePage';
