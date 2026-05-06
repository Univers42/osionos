/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDatabaseStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/06 23:05:59 by dlesieur         ###   ########.fr       */
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
  createInlineDatabase: () => ({
    databaseId: DEFAULT_OBJECT_DATABASE_ID,
    viewId: DEFAULT_OBJECT_DATABASE_VIEW_ID,
  }),
}));
