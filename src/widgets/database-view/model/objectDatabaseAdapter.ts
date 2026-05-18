/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseAdapter.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { RemoteAdapter, type ObjectDatabaseAdapter } from '@notion-db/object-database';

let sharedAdapter: ObjectDatabaseAdapter | null = null;

export function hasObjectDatabaseRemoteAdapter(): boolean {
  return Boolean(import.meta.env.VITE_CONTRACT_SERVER_URL);
}

export function getObjectDatabaseAdapter(): ObjectDatabaseAdapter | null {
  const contractServerUrl = import.meta.env.VITE_CONTRACT_SERVER_URL;
  if (!contractServerUrl) return null;

  sharedAdapter ??= new RemoteAdapter({
    baseUrl: contractServerUrl,
    token: import.meta.env.VITE_CONTRACT_SERVER_TOKEN || undefined,
  });

  return sharedAdapter;
}
