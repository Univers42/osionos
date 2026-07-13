/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMcpSettingsStore.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { addConnection, canConnectApp, removeConnection } from './mcpPolicy';
import { nowIso, stableDefault } from './settingsStoreUtils';
import { recordSettingsAction } from './useSettingsAuditStore';
import type { McpAllowedTool, McpRestrictPolicy, McpSettings } from './types';

export { canConnectApp } from './mcpPolicy';

interface McpSettingsStore {
  data: Record<string, McpSettings>;
  getData: (workspaceId: string) => McpSettings;
  update: (workspaceId: string, patch: Partial<McpSettings>) => void;
  toggleTool: (workspaceId: string, tool: McpAllowedTool) => void;
  setRestrictPolicy: (workspaceId: string, policy: McpRestrictPolicy) => void;
  toggleApprovedApp: (workspaceId: string, appId: string) => void;
  connectApp: (workspaceId: string, appId: string, member: { id: string; name: string }) => boolean;
  disconnectApp: (workspaceId: string, appId: string, memberId?: string) => void;
  disconnectAll: (workspaceId: string) => void;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:mcp';

export const MCP_TOOL_OPTIONS: Array<{ value: McpAllowedTool; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'search', label: 'Search pages' },
  { value: 'read', label: 'Read pages' },
  { value: 'create', label: 'Create pages' },
  { value: 'update', label: 'Update pages' },
  { value: 'archive', label: 'Archive pages' },
];

export function defaultMcpSettings(workspaceId: string): McpSettings {
  return {
    workspaceId,
    connected: true,
    allowedTools: ['status', 'search', 'read', 'create', 'update'],
    developerMode: false,
    restrictPolicy: 'all',
    approvedApps: [],
    connections: [],
    updatedAt: nowIso(),
  };
}

// Fill any field a legacy persisted row is missing so downstream code never
// hits `undefined.map`. Kept in one place and used by both migrate() and the
// action guards.
function normalizeMcp(value: Partial<McpSettings> | undefined, workspaceId: string): McpSettings {
  const base = defaultMcpSettings(workspaceId);
  return {
    ...base,
    ...value,
    workspaceId,
    allowedTools: value?.allowedTools ?? base.allowedTools,
    restrictPolicy: value?.restrictPolicy ?? base.restrictPolicy,
    approvedApps: value?.approvedApps ?? base.approvedApps,
    connections: value?.connections ?? base.connections,
    updatedAt: value?.updatedAt ?? base.updatedAt,
  };
}

export const useMcpSettingsStore = create<McpSettingsStore>()(
  persist(
    (set, get) => ({
      data: {},
      getData: (workspaceId) =>
        get().data[workspaceId] ?? stableDefault(`mcp:${workspaceId || 'local-workspace'}`, () => defaultMcpSettings(workspaceId || 'local-workspace')),
      update: (workspaceId, patch) => {
        const current = get().getData(workspaceId);
        const next = { ...current, ...patch, updatedAt: nowIso() };
        set((state) => ({ data: { ...state.data, [workspaceId]: next } }));
        recordSettingsAction('mcp_settings_update', { workspaceId, patch });
      },
      toggleTool: (workspaceId, tool) => {
        const current = get().getData(workspaceId);
        const allowedTools = current.allowedTools.includes(tool)
          ? current.allowedTools.filter((item) => item !== tool)
          : [...current.allowedTools, tool];
        get().update(workspaceId, { allowedTools });
      },
      setRestrictPolicy: (workspaceId, policy) => {
        get().update(workspaceId, { restrictPolicy: policy });
        recordSettingsAction('mcp_restrict_policy', { workspaceId, policy });
      },
      toggleApprovedApp: (workspaceId, appId) => {
        const current = get().getData(workspaceId);
        const approved = current.approvedApps ?? [];
        const approvedApps = approved.includes(appId)
          ? approved.filter((item) => item !== appId)
          : [...approved, appId];
        get().update(workspaceId, { approvedApps });
      },
      connectApp: (workspaceId, appId, member) => {
        const current = get().getData(workspaceId);
        if (!canConnectApp(current, appId)) return false;
        const before = current.connections ?? [];
        const after = addConnection(before, appId, member, nowIso());
        if (after !== before) {
          get().update(workspaceId, { connections: after });
          recordSettingsAction('mcp_app_connect', { workspaceId, appId, memberId: member.id });
        }
        return true;
      },
      disconnectApp: (workspaceId, appId, memberId) => {
        const current = get().getData(workspaceId);
        const connections = removeConnection(current.connections ?? [], appId, memberId);
        get().update(workspaceId, { connections });
        recordSettingsAction('mcp_app_disconnect', { workspaceId, appId, memberId: memberId ?? 'all' });
      },
      disconnectAll: (workspaceId) => {
        get().update(workspaceId, { connections: [] });
        recordSettingsAction('mcp_disconnect_all', { workspaceId });
      },
      reset: (workspaceId) => {
        set((state) => ({ data: { ...state.data, [workspaceId]: defaultMcpSettings(workspaceId || 'local-workspace') } }));
        recordSettingsAction('mcp_settings_reset', { workspaceId });
      },
    }),
    {
      name: STORE_NAME,
      version: 1,
      // Rows persisted before the connections/restrict fields existed are
      // completed here ONCE at rehydration, so getData returns stable, fully
      // shaped objects (no fresh-object loop, no undefined arrays).
      migrate: (persisted, _version) => {
        const state = (persisted ?? {}) as { data?: Record<string, Partial<McpSettings>> };
        const data: Record<string, McpSettings> = {};
        for (const [workspaceId, value] of Object.entries(state.data ?? {})) {
          data[workspaceId] = normalizeMcp(value, workspaceId);
        }
        return { data };
      },
    },
  ),
);
