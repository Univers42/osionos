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

import React from "react";

const BUTTON = "rounded-xs border border-[var(--osio-code-border)] px-2 py-1 text-xs text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover)]";

export const ExplorerLoading: React.FC = () => (
  <p role="status" className="px-3 py-2 text-xs text-[var(--osio-code-fg-muted)]">Loading workspace files…</p>
);

export const ExplorerError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-col items-start gap-2 px-3 py-2 text-xs text-[var(--osio-code-fg)]">
    <span>Could not read the workspace folder: {message}</span>
    <button type="button" onClick={onRetry} className={BUTTON}>Retry</button>
  </div>
);

export const ExplorerEmpty: React.FC<{ onNewFile: () => void; onNewFolder: () => void }> = ({ onNewFile, onNewFolder }) => (
  <div className="flex flex-col items-start gap-2 px-3 py-3 text-xs text-[var(--osio-code-fg-muted)]">
    <p>This workspace folder is empty</p>
    <div className="flex gap-2">
      <button type="button" onClick={onNewFile} className={BUTTON}>New file</button>
      <button type="button" onClick={onNewFolder} className={BUTTON}>New folder</button>
    </div>
  </div>
);

export const ExplorerNotice: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
  <div role="alert" className="flex items-start justify-between gap-2 px-3 py-1.5 text-xs text-[var(--osio-code-fg)]">
    <span>{message}</span>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="underline">Dismiss</button>}
  </div>
);

/** In-UI replacement for window.confirm; focus starts on the safe choice. */
export const ExplorerDeleteConfirm: React.FC<{ name: string; onConfirm: () => void; onCancel: () => void }> = ({ name, onConfirm, onCancel }) => (
  <div
    role="alertdialog"
    aria-labelledby="explorer-delete-title"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}
    className="flex flex-col gap-2 border-t border-[var(--osio-code-border)] px-3 py-2 text-xs text-[var(--osio-code-fg)]"
  >
    <p id="explorer-delete-title">Move “{name}” to the trash? A folder goes with everything inside. Restore it from Archived files.</p>
    <div className="flex gap-2">
      <button type="button" autoFocus onClick={onCancel} className={BUTTON}>Cancel</button>
      <button type="button" onClick={onConfirm} className={BUTTON}>Move to trash</button>
    </div>
  </div>
);
