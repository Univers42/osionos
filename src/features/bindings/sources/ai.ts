/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai.ts                                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AiSettings } from "@/store/settings";
import { createStoreRecordSource } from "@/entities/block/model/bindingSources";
import type { FieldSpec, RecordSource } from "@/entities/block/model/bindingSources";

export interface AiSettingsStoreState {
  data: Record<string, AiSettings>;
  getData(workspaceId: string): AiSettings;
  update(workspaceId: string, patch: Partial<AiSettings>): void;
}

export interface UserStoreState {
  activeUserId: string;
  activeWorkspace?(): { _id?: string } | null;
}

type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };

function getWorkspaceId(userState: UserStoreState, store?: StoreLike<UserStoreState>): string {
  let activeWorkspace: { _id?: string } | null = null;
  if (typeof userState.activeWorkspace === "function") activeWorkspace = userState.activeWorkspace();
  else if (userState.activeWorkspace) activeWorkspace = userState.activeWorkspace;
  if (!activeWorkspace && store && typeof (store as unknown as { activeWorkspace?: () => { _id?: string } | null }).activeWorkspace === "function") {
    activeWorkspace = (store as unknown as { activeWorkspace: () => { _id?: string } | null }).activeWorkspace();
  }
  return activeWorkspace?._id ?? "local-workspace";
}

function getUpdate(store: StoreLike<AiSettingsStoreState>): AiSettingsStoreState["update"] | null {
  const state = store.getState();
  if (typeof state.update === "function") return state.update.bind(state);
  const candidate = (store as unknown as { update?: AiSettingsStoreState["update"] }).update;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

function getData(store: StoreLike<AiSettingsStoreState>, workspaceId: string): AiSettings {
  const state = store.getState();
  if (typeof state.getData === "function") return state.getData(workspaceId);
  const record = state.data?.[workspaceId];
  if (record) return record;
  return {
    workspaceId,
    connectors: false,
    meetingNotesAutoRecord: false,
    agentsEnabled: true,
    customAgentsAllowed: false,
    searchEverywhereIndexing: false,
    summaries: true,
    updatedAt: new Date().toISOString(),
  };
}

const fields: readonly FieldSpec[] = [
  { key: "connectors", display: "switch", label: "AI connectors" },
  { key: "meetingNotesAutoRecord", display: "switch", label: "Meeting notes auto-record" },
  { key: "agentsEnabled", display: "switch", label: "Agents" },
  { key: "customAgentsAllowed", display: "switch", label: "Custom agents" },
  { key: "searchEverywhereIndexing", display: "switch", label: "Search everywhere indexing" },
  { key: "summaries", display: "switch", label: "Summaries" },
];

export function createAiSource(deps: {
  ai: StoreLike<AiSettingsStoreState>;
  user: StoreLike<UserStoreState>;
}): RecordSource {
  return createStoreRecordSource<AiSettingsStoreState>({
    id: "settings:ai",
    label: "AI",
    fields,
    store: deps.ai,
    read: (state) => {
      const userState = deps.user.getState();
      if (!userState.activeUserId) return null;
      const workspaceId = getWorkspaceId(userState, deps.user);
      const data = (typeof state.getData === "function" ? state.getData(workspaceId) : state.data?.[workspaceId]) ?? getData(deps.ai, workspaceId);
      return {
        connectors: data.connectors ?? false,
        meetingNotesAutoRecord: data.meetingNotesAutoRecord ?? false,
        agentsEnabled: data.agentsEnabled ?? true,
        customAgentsAllowed: data.customAgentsAllowed ?? false,
        searchEverywhereIndexing: data.searchEverywhereIndexing ?? false,
        summaries: data.summaries ?? true,
      };
    },
    isLoading: () => false,
    write: (patch) => {
      const field = Object.keys(patch)[0];
      const value = patch[field];
      const userState = deps.user.getState();
      if (!userState.activeUserId) return;
      const workspaceId = getWorkspaceId(userState, deps.user);
      const update = getUpdate(deps.ai);
      if (!update) return;
      update(workspaceId, { [field]: value } as Partial<AiSettings>);
    },
  });
}
