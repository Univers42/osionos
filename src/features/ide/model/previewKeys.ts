/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   previewKeys.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { RawLayoutMode } from "@/features/raw-mode/model/rawModeLayout";

/**
 * Claimed on the split so the app's dispatcher yields the key to it
 * (useAutomationDispatcher reads aria-keyshortcuts) instead of running paste-plain.
 */
export const PREVIEW_TOGGLE_ARIA = "Control+Shift+V Meta+Shift+V";

export interface PreviewKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
}

export function isMacPlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent);
}

/**
 * Cmd+Shift+V on macOS, Ctrl+Shift+V elsewhere. An IME in progress (Safari reports
 * keyCode 229 there) and key repeat are left alone.
 * Caveat: matches `key`, not the physical `code`: on a non-Latin layout (Cyrillic,
 * Greek) the V key reports its own letter and the shortcut does not fire; the
 * Code/Split/Preview buttons still switch.
 */
export function isPreviewToggleKey(event: PreviewKeyEvent, isMac: boolean): boolean {
  if (event.isComposing || event.keyCode === 229 || event.repeat) return false;
  if (event.altKey || !event.shiftKey || event.key.toLowerCase() !== "v") return false;
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export interface PreviewView {
  mode: RawLayoutMode;
  /** Where the shortcut goes back to from the preview: "code" or "split". */
  returnTo: RawLayoutMode;
}

export function toggledPreviewView({ mode, returnTo }: PreviewView): PreviewView {
  if (mode === "preview") return { mode: returnTo, returnTo };
  return { mode: "preview", returnTo: mode };
}

export function choosePreviewMode(view: PreviewView, mode: RawLayoutMode): PreviewView {
  return { mode, returnTo: mode === "preview" ? view.returnTo : mode };
}
