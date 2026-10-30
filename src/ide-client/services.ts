/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   services.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The VS Code services the IDE page runs in "editor" mode: no views, no workbench parts.
// osionos keeps the layout; these only supply behaviour (files, terminal, git, debug, extensions).
import type { IEditorOverrideServices } from "@codingame/monaco-vscode-api";
import getAuthenticationServiceOverride from "@codingame/monaco-vscode-authentication-service-override";
import getBaseServiceOverride from "@codingame/monaco-vscode-base-service-override";
import getBulkEditServiceOverride from "@codingame/monaco-vscode-bulk-edit-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import getDebugServiceOverride from "@codingame/monaco-vscode-debug-service-override";
import getDialogsServiceOverride from "@codingame/monaco-vscode-dialogs-service-override";
import getEditorServiceOverride, { type OpenEditor } from "@codingame/monaco-vscode-editor-service-override";
import getEnvironmentServiceOverride from "@codingame/monaco-vscode-environment-service-override";
import getExtensionGalleryServiceOverride from "@codingame/monaco-vscode-extension-gallery-service-override";
import getExtensionServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import getFilesServiceOverride from "@codingame/monaco-vscode-files-service-override";
import getHostServiceOverride from "@codingame/monaco-vscode-host-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getLifecycleServiceOverride from "@codingame/monaco-vscode-lifecycle-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getNotificationServiceOverride from "@codingame/monaco-vscode-notifications-service-override";
import getOutputServiceOverride from "@codingame/monaco-vscode-output-service-override";
import getPreferencesServiceOverride from "@codingame/monaco-vscode-preferences-service-override";
import getQuickAccessServiceOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import getRemoteAgentServiceOverride from "@codingame/monaco-vscode-remote-agent-service-override";
import getScmServiceOverride from "@codingame/monaco-vscode-scm-service-override";
import getSearchServiceOverride from "@codingame/monaco-vscode-search-service-override";
import getSecretStorageServiceOverride from "@codingame/monaco-vscode-secret-storage-service-override";
import getSnippetServiceOverride from "@codingame/monaco-vscode-snippets-service-override";
import getStorageServiceOverride from "@codingame/monaco-vscode-storage-service-override";
import getTaskServiceOverride from "@codingame/monaco-vscode-task-service-override";
import getTerminalServiceOverride from "@codingame/monaco-vscode-terminal-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getWorkingCopyServiceOverride from "@codingame/monaco-vscode-working-copy-service-override";
import getWorkspaceTrustOverride from "@codingame/monaco-vscode-workspace-trust-service-override"
;
export function editorModeServices(openEditor: OpenEditor): IEditorOverrideServices {
  return {
    ...getBaseServiceOverride(),
    ...getLogServiceOverride(),
    ...getAuthenticationServiceOverride(),
    ...getExtensionServiceOverride({ enableWorkerExtensionHost: false }),
    ...getExtensionGalleryServiceOverride(),
    ...getModelServiceOverride(),
    ...getNotificationServiceOverride(),
    ...getDialogsServiceOverride(),
    ...getConfigurationServiceOverride(),
    ...getKeybindingsServiceOverride(),
    ...getTextmateServiceOverride(),
    ...getThemeServiceOverride(),
    ...getLanguagesServiceOverride(),
    ...getPreferencesServiceOverride(),
    ...getOutputServiceOverride(),
    // No backend argument: the terminal runs on the connected machine (remote terminal backend).
    ...getTerminalServiceOverride(),
    ...getStorageServiceOverride(),
    ...getRemoteAgentServiceOverride({ scanRemoteExtensions: true }),
    ...getLifecycleServiceOverride(),
    ...getEnvironmentServiceOverride(),
    ...getWorkspaceTrustOverride(),
    ...getWorkingCopyServiceOverride(),
    ...getFilesServiceOverride(),
    ...getEditorServiceOverride(openEditor),
    ...getScmServiceOverride(),
    ...getDebugServiceOverride(),
    ...getMarkersServiceOverride(),
    ...getSearchServiceOverride(),
    ...getQuickAccessServiceOverride(),
    ...getHostServiceOverride(),
    ...getTaskServiceOverride(),
    ...getSnippetServiceOverride(),
    ...getBulkEditServiceOverride(),
    ...getSecretStorageServiceOverride(),
  };
}
