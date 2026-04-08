/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDatabaseStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:03:53 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * useDatabaseStore stub — placeholder for the database CRUD store.
 * In standalone mode, this provides a no-op createInlineDatabase.
 */
import { create } from 'zustand';

interface DatabaseStore {
  createInlineDatabase: (name?: string) => { databaseId: string; viewId: string } | null;
}

export const useDatabaseStore = create<DatabaseStore>(() => ({
  createInlineDatabase: (name?: string) => {
    const id = crypto.randomUUID();
    console.info('[databaseStore] Created stub inline database:', name ?? 'Untitled', id);
    return { databaseId: id, viewId: `view-${id.slice(0, 8)}` };
  },
}));
