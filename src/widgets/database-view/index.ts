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

// Side effect: registers the account-wide data-source catalog with NDS so
// the view-settings Source picker can list and rebind to any database.
import './model/dataSourceProvider';

export * from './ui/DatabaseBlock';
export * from './ui/WorkspaceDatabaseBlock';
export * from './model/databaseViewCatalog';
export * from './model/workspaceDatabaseConstants';
export * from './model/workspaceNav';
export * from './model/workspaceDatabasePage';
