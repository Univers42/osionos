/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDatabaseStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 00:51:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * useDatabaseStore bridge — returns the canonical Mongo-backed database target.
 */
import { create } from 'zustand';

export const DEFAULT_OBJECT_DATABASE_ID = 'db-tasks';
export const DEFAULT_OBJECT_DATABASE_VIEW_ID = 'v-tasks-table';

export interface DatabaseReference {
  databaseId: string;
  viewId: string;
}

interface DatabaseStore {
  createInlineDatabase: (name?: string) => DatabaseReference;
}

export const useDatabaseStore = create<DatabaseStore>(() => ({
  createInlineDatabase: () => {
    const suffix = createIdSuffix();
    const databaseId = `db-${suffix}`;
    return {
      databaseId,
      viewId: `${databaseId}-table`,
    };
  },
}));

function createIdSuffix(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
