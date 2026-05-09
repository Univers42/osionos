import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { nowIso } from './settingsStoreUtils';
import { recordSettingsAction } from './useSettingsAuditStore';
import type { McpAllowedTool, McpSettings } from './types';

interface McpSettingsStore {
  data: Record<string, McpSettings>;
  getData: (workspaceId: string) => McpSettings;
  update: (workspaceId: string, patch: Partial<McpSettings>) => void;
  toggleTool: (workspaceId: string, tool: McpAllowedTool) => void;
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
    updatedAt: nowIso(),
  };
}

export const useMcpSettingsStore = create<McpSettingsStore>()(
  persist(
    (set, get) => ({
      data: {},
      getData: (workspaceId) => get().data[workspaceId] ?? defaultMcpSettings(workspaceId || 'local-workspace'),
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
      reset: (workspaceId) => {
        set((state) => ({ data: { ...state.data, [workspaceId]: defaultMcpSettings(workspaceId || 'local-workspace') } }));
        recordSettingsAction('mcp_settings_reset', { workspaceId });
      },
    }),
    { name: STORE_NAME },
  ),
);