/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   headerTemplate.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Data-driven record-header template. A header is a list of `regions`, each an
 * ordered list of `slots`. Every slot either binds to a record value (`bind` = a
 * property key, or a core page field "title" | "icon" | "cover") or is a fixed
 * action. The schema carries ZERO CSS — only `kind` (which renderer), `tone`
 * (which token set), `layout` (which container) and `format`. Visuals resolve
 * through the existing atoms + `--osio-*` tokens, so re-theming is automatic.
 * This is the engine; the marketplace ships the first preset (see features/marketplace).
 */

/** Which slot renderer to use. */
export type HeaderSlotKind =
  | "media" // large square image / icon
  | "title" // big record title
  | "author" // text value + optional verified check
  | "link" // a url value as an anchor
  | "stat" // icon + formatted number (downloads)
  | "rating" // a 0-5 star row + optional "(count)"
  | "text" // any text value (short description)
  | "badge" // select / multi_select value(s) as pills
  | "action"; // a button bound to a named app action

/** Maps to Button tones — no raw color, token-driven. */
export type HeaderTone = "default" | "primary" | "danger" | "ghost";

/** App-level intents an action slot can dispatch. */
export type HeaderActionKind =
  | "install"
  | "uninstall"
  | "auto_update"
  | "config"
  | "pre_release"
  | "open_url";

/** aside = left media column; main = stacked title block; meta = inline chip row; actions = button row. */
export type HeaderRegionKind = "aside" | "main" | "meta" | "actions";

export type HeaderLayout = "media_aside" | "stacked";

export type HeaderStatFormat = "number" | "compact" | "raw";

export interface HeaderSlot {
  /** Stable id (keys + drag reorder). */
  id: string;
  kind: HeaderSlotKind;
  /** Property key the slot reads, or a core page field ("title" | "icon" | "cover"). */
  bind?: string;
  /** iconValue string for stat / action ("icon:download"). */
  icon?: string;
  /** Literal label fallback (action text, etc.). */
  label?: string;
  /** Intent for kind === "action". */
  action?: HeaderActionKind;
  tone?: HeaderTone;
  /** Stat formatting; default groups thousands. */
  format?: HeaderStatFormat;
  /** rating: the property holding the ratings count "(123)". */
  countBind?: string;
  /** author: the boolean property that drives the verified check. */
  verifiedBind?: string;
}

export interface HeaderRegion {
  id: string;
  kind: HeaderRegionKind;
  slots: HeaderSlot[];
}

export interface HeaderTemplate {
  id: string;
  version: 1;
  layout: HeaderLayout;
  regions: HeaderRegion[];
}

/**
 * Starter template mirroring the classic header (icon beside title) — the
 * editing seed for the header customizer. Every slot is then rebindable,
 * reorderable, or removable like any designed header.
 */
export function classicHeaderTemplate(): HeaderTemplate {
  return {
    id: "classic",
    version: 1,
    layout: "media_aside",
    regions: [
      { id: "aside", kind: "aside", slots: [{ id: "media", kind: "media", bind: "icon" }] },
      { id: "main", kind: "main", slots: [{ id: "title", kind: "title", bind: "title" }] },
      { id: "meta", kind: "meta", slots: [] },
      { id: "actions", kind: "actions", slots: [] },
    ],
  };
}
