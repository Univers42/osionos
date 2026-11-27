/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingRows.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The ':' rows of the top bar: a setting changed from the keyboard without
// opening Settings. The table of settings lives with Settings
// (features/settings/model/inlineSettings.ts); this file only matches it.

import type { PaletteResult } from "./search";

export interface InlineSettingOption {
  value: string;
  label: string;
}

/** Why a setting cannot change from the bar right now, and where it is changed instead. */
export interface InlineSettingBlock {
  reason: string;
  open: () => void;
}

export interface InlineSetting {
  id: string;
  label: string;
  keywords?: string[];
  options: InlineSettingOption[];
  /** The value in force now, read at match time. */
  current: () => string;
  apply: (value: string) => void;
  blocked?: () => InlineSettingBlock | null;
}

/** The prefix that puts the bar in setting mode. */
export const SETTING_PREFIX = ":";

const noop = () => undefined;

/** A setting with its state read once, so every row of one match agrees. */
interface SettingState {
  setting: InlineSetting;
  current: string;
  block: InlineSettingBlock | null;
}

function readState(setting: InlineSetting): SettingState {
  return { setting, current: setting.current(), block: setting.blocked?.() ?? null };
}

/** One row per setting, its value as the subtitle; choosing it narrows the bar to that setting. */
function overviewRow({ setting, current, block }: SettingState): PaletteResult {
  const value = setting.options.find((option) => option.value === current)?.label;
  return {
    id: `setting:${setting.id}`,
    title: setting.label,
    subtitle: block ? block.reason : value,
    kind: "setting",
    refine: `${SETTING_PREFIX}${setting.label} `,
    run: noop,
  };
}

/** The value in force runs nothing: choosing it again must not rewrite storage or re-render the page. */
function optionRow({ setting, current, block }: SettingState, option: InlineSettingOption): PaletteResult {
  const isCurrent = current === option.value;
  let run: () => void = () => setting.apply(option.value);
  if (block) run = block.open;
  else if (isCurrent) run = noop;
  return {
    id: `setting:${setting.id}:${option.value}`,
    title: `${setting.label}: ${option.label}`,
    subtitle: block?.reason ?? (isCurrent ? "Current" : undefined),
    kind: "setting",
    run,
  };
}

/** The setting the term names in full followed by a space (":Theme "), longest name first, and what follows it. */
function drilledSetting(term: string, settings: InlineSetting[]): { setting: InlineSetting; rest: string } | null {
  const lowered = term.trimStart().toLowerCase();
  let found: InlineSetting | null = null;
  for (const setting of settings) {
    const head = `${setting.label.toLowerCase()} `;
    if (lowered.startsWith(head) && (!found || setting.label.length > found.label.length)) found = setting;
  }
  return found ? { setting: found, rest: lowered.slice(found.label.length + 1) } : null;
}

function wordsOf(text: string): string[] {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** The ':' rows for `term`.
 *  - No term: one row per setting.
 *  - A setting's full name and a space (":Theme "): only that setting's options,
 *    filtered by whatever follows.
 *  - Anything else: every `<Setting>: <Option>` whose name contains every word
 *    of the term; only when no name matches, the ones whose keywords do.
 *  Caveat: substring words, not fuzzy — "drk" finds nothing. A keyword match
 *  never shows beside a name match, so a setting reached only by a keyword
 *  ("cursor" → Caret shape) stays hidden while any label holds the word;
 *  typing the setting's name reaches it. */
export function matchSettings(term: string, settings: InlineSetting[], limit = 30): PaletteResult[] {
  const drilled = drilledSetting(term, settings);
  if (drilled) {
    const state = readState(drilled.setting);
    const words = wordsOf(drilled.rest);
    return drilled.setting.options
      .filter((option) => words.every((word) => option.label.toLowerCase().includes(word)))
      .map((option) => optionRow(state, option));
  }
  const words = wordsOf(term);
  if (words.length === 0) return settings.map((setting) => overviewRow(readState(setting)));
  const byName: PaletteResult[] = [];
  const byKeyword: PaletteResult[] = [];
  for (const setting of settings) {
    const keywords = (setting.keywords ?? []).join(" ").toLowerCase();
    let state: SettingState | null = null;
    for (const option of setting.options) {
      const name = `${setting.label} ${option.label}`.toLowerCase();
      const inName = words.every((word) => name.includes(word));
      if (!inName && !words.every((word) => name.includes(word) || keywords.includes(word))) continue;
      state ??= readState(setting);
      (inName ? byName : byKeyword).push(optionRow(state, option));
    }
  }
  return (byName.length > 0 ? byName : byKeyword).slice(0, limit);
}
