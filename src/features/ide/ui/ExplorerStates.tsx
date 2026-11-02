/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerStates.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { WORKSPACE_EXPLORER_COPY, type ExplorerCopy } from "./explorerContext";
import React from "react";
import { FolderOpen, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@osionos/ui/atoms/Button";

// Text colours of the two surfaces a state can sit on: the sidebar card, and the
// dark code surfaces of the dock (data-code-theme), which keep their own palette.
const TONES = {
  sidebar: { title: "text-[var(--osio-fg-default)]", body: "text-[var(--osio-fg-muted)]" },
  code: { title: "text-[var(--osio-code-fg)]", body: "text-[var(--osio-code-fg-muted)]" },
} as const;

// The kit Button's default tone reads these five tokens; remapping them on the button
// gives the always-dark code surface its own palette (the app's control tokens would
// paint a white pill on it under the light theme) with no competing utilities.
export const CODE_BUTTON =
  "[--osio-bg-surface:var(--osio-code-chip-bg)] [--osio-control-border:var(--osio-code-border)] " +
  "[--osio-border-strong:var(--osio-code-border)] [--osio-fg-default:var(--osio-code-fg)] " +
  "[--osio-control-bg-hover:var(--osio-code-btn-hover)]";

/** One empty / error / unavailable state for every IDE surface: a muted icon, a
 *  title, an optional line of detail, and the actions as kit Buttons. */
export const StateBlock: React.FC<{
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof TONES;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, tone = "sidebar", children, actions }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
    <Icon size={20} aria-hidden="true" className={TONES[tone].body} />
    <p className={`text-sm font-medium ${TONES[tone].title}`}>{title}</p>
    {children && <div className={`flex flex-col gap-1 text-sm ${TONES[tone].body}`}>{children}</div>}
    {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
  </div>
);

export const ExplorerLoading: React.FC<{ text?: string }> = ({ text = WORKSPACE_EXPLORER_COPY.loading }) => (
  <p role="status" className="px-3 py-2 text-sm text-[var(--osio-fg-muted)]">{text}</p>
);

export const ExplorerError: React.FC<{ message: string; onRetry: () => void; title?: string }> = ({ message, onRetry, title = WORKSPACE_EXPLORER_COPY.errorTitle }) => (
  <div role="alert">
    <StateBlock
      icon={TriangleAlert}
      title={title}
      actions={<Button size="sm" onClick={onRetry}>Retry</Button>}
    >
      <p>{message}</p>
    </StateBlock>
  </div>
);

export const ExplorerEmpty: React.FC<{ onNewFile: () => void; onNewFolder: () => void; title?: string }> = ({ onNewFile, onNewFolder, title = WORKSPACE_EXPLORER_COPY.emptyTitle }) => (
  <StateBlock
    icon={FolderOpen}
    title={title}
    actions={(
      <>
        <Button size="sm" onClick={onNewFile}>New file</Button>
        <Button size="sm" onClick={onNewFolder}>New folder</Button>
      </>
    )}
  />
);

export const ExplorerNotice: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
  <div role="alert" className="mx-2 mb-1 flex items-center justify-between gap-2 rounded-[var(--osio-radius-sm)] bg-[var(--osio-bg-muted)] py-1 pl-2 pr-1 text-xs text-[var(--osio-fg-default)]">
    <span className="min-w-0">{message}</span>
    {onDismiss && <Button size="sm" tone="ghost" onClick={onDismiss} aria-label="Dismiss message">Dismiss</Button>}
  </div>
);

/** In-UI replacement for window.confirm; focus starts on the safe choice. */
export const ExplorerDeleteConfirm: React.FC<{ name: string; onConfirm: () => void; onCancel: () => void; copy?: ExplorerCopy }> = ({ name, onConfirm, onCancel, copy = WORKSPACE_EXPLORER_COPY }) => (
  <div
    role="alertdialog"
    aria-labelledby="explorer-delete-title"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}
    className="osio-surface-panel m-2 flex flex-col gap-2 p-3 text-sm text-[var(--osio-fg-default)]"
  >
    <p id="explorer-delete-title">{copy.deleteQuestion(name)}</p>
    <div className="flex justify-end gap-2">
      <Button size="sm" autoFocus onClick={onCancel}>Cancel</Button>
      <Button size="sm" tone="danger" onClick={onConfirm}>{copy.deleteAction}</Button>
    </div>
  </div>
);
