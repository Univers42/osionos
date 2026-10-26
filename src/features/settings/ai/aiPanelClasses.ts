/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiPanelClasses.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The class strings the AI settings panels share, so each is written once. */

export const CHIP =
  "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium";

export const FIELD_LABEL = "block text-xs font-medium text-[var(--osio-fg-default)]";

export const FIELD_INPUT =
  "mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none transition-colors focus-visible:border-[var(--osio-accent)]";

export const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] disabled:cursor-not-allowed disabled:opacity-50";

export const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-50";

export const DANGER_BUTTON =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50";

// The MCP servers part: its text, rows and borders, written once.
export const MCP_TEXT_MUTED_XS = "text-xs text-[var(--osio-fg-muted)]";
export const MCP_TEXT_MUTED_SM = "text-sm text-[var(--osio-fg-muted)]";
export const MCP_TEXT_DANGER_XS = "text-xs text-[var(--osio-danger)]";
export const MCP_TEXT_DANGER_SM = "text-sm text-[var(--osio-danger)]";
export const MCP_TITLE = "text-sm font-medium text-[var(--osio-fg-default)]";
export const MCP_BOX = "rounded-lg border border-[var(--osio-border-default)] p-3";
export const MCP_TOOL_LIST =
  "mt-2 divide-y divide-[var(--osio-border-default)] rounded-md border border-[var(--osio-border-default)]";
export const MCP_STATUS_CHIP = "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-muted)]";
