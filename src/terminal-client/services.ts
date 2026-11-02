// The terminal page's VS Code services (devil amendments A3 and 2, T8): what VS Code's terminal panel
// needs to draw and type, and nothing that runs code on its own — no tasks, debugger, extensions,
// gallery, remote agent, source control or search. The views override brings the panel part (tabs,
// toolbar, find), the command palette and the keybindings.
import type { IEditorOverrideServices } from "@codingame/monaco-vscode-api";
import getBaseServiceOverride from "@codingame/monaco-vscode-base-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import getDialogsServiceOverride from "@codingame/monaco-vscode-dialogs-service-override";
import getEnvironmentServiceOverride from "@codingame/monaco-vscode-environment-service-override";
import getFilesServiceOverride from "@codingame/monaco-vscode-files-service-override";
import getHostServiceOverride from "@codingame/monaco-vscode-host-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getLifecycleServiceOverride from "@codingame/monaco-vscode-lifecycle-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getNotificationServiceOverride from "@codingame/monaco-vscode-notifications-service-override";
import getStorageServiceOverride from "@codingame/monaco-vscode-storage-service-override";
import getTerminalServiceOverride from "@codingame/monaco-vscode-terminal-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getViewsServiceOverride from "@codingame/monaco-vscode-views-service-override";
import getWorkspaceTrustOverride from "@codingame/monaco-vscode-workspace-trust-service-override";
import type { ITerminalBackend } from "@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal";

export function terminalModeServices(backend: ITerminalBackend): IEditorOverrideServices {
  return {
    ...getBaseServiceOverride(),
    // First: it spreads its own keybindings override, which the one below must replace.
    ...getViewsServiceOverride(),
    ...getLogServiceOverride(),
    ...getModelServiceOverride(),
    ...getNotificationServiceOverride(),
    ...getDialogsServiceOverride(),
    ...getConfigurationServiceOverride(),
    // The whole page is VS Code's panel, so its keybindings (copy, paste, find, split) apply
    // wherever focus is, not only inside an editor.
    ...getKeybindingsServiceOverride({ shouldUseGlobalKeybindings: () => true }),
    ...getThemeServiceOverride(),
    ...getTerminalServiceOverride(backend),
    ...getStorageServiceOverride(),
    ...getLifecycleServiceOverride(),
    ...getEnvironmentServiceOverride(),
    ...getWorkspaceTrustOverride(),
    ...getFilesServiceOverride(),
    ...getHostServiceOverride(),
  };
}

/** The workbench options: an untrusted, empty workspace, which nothing can open. */
export function terminalWorkbenchOptions(configurationDefaults: Record<string, unknown>) {
  return {
    configurationDefaults,
    workspaceProvider: { trusted: false, workspace: undefined, open: async () => false },
  };
}
