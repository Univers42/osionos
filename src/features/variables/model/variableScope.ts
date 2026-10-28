/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variableScope.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ResolvedVariable } from "@osionos/markdown-engine";

import type { UserPreferences } from "@/store/settings/types";
import { useUserPreferencesStore } from "@/store/settings/useUserPreferencesStore";
import { usePageStore } from "@/store/usePageStore";

import { resolveVariable, type VariableScope } from "./variableResolver";
import type { FormatContext } from "./variableFormat";
import { useVariablesStore } from "./useVariablesStore";

const NUMBER_LOCALES: Record<string, string> = { dot: "en-US", comma: "de-DE", space: "fr-FR" };
const NO_DEFINITIONS: VariableScope["definitions"] = new Map();
const hostTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function supportedLocale(tag: string | undefined): string {
  try {
    return (tag && Intl.DateTimeFormat.supportedLocalesOf(tag)[0]) || "en-US";
  } catch {
    return "en-US";
  }
}

let contextFor: { preferences: UserPreferences | null; context: Omit<FormatContext, "now"> } | undefined;

/** A bad stored locale must not turn every chip into an error, so it falls back to en-US. */
function preferenceContext(preferences: UserPreferences | null): Omit<FormatContext, "now"> {
  if (contextFor?.preferences === preferences) return contextFor.context;
  const locale = supportedLocale(preferences?.language ?? globalThis.navigator?.language);
  const context = {
    locale,
    numberLocale: NUMBER_LOCALES[preferences?.numberFormat ?? ""] ?? locale,
    timeZone: preferences && !preferences.autoTimezone && preferences.timezone ? preferences.timezone : hostTimeZone(),
  };
  contextFor = { preferences, context };
  return context;
}

/** The scope a block of `pageId` resolves in: its page, its workspace's env.json, the user's preferences. */
export function variableScopeFor(pageId: string | undefined, now = new Date()): VariableScope {
  const page = pageId ? usePageStore.getState().pageById(pageId) : undefined;
  const preferences = useUserPreferencesStore.getState().data;
  return {
    definitions: (page && useVariablesStore.getState().byWorkspace[page.workspaceId]?.definitions) || NO_DEFINITIONS,
    page,
    context: { ...preferenceContext(preferences), now },
    dateFormat: preferences?.dateFormat ?? "relative",
  };
}

/** The engine's `resolveVariable` hook, bound to one page. */
export function variableResolverFor(pageId: string | undefined): (expr: string) => ResolvedVariable | null {
  return (expr) => resolveVariable(expr, variableScopeFor(pageId));
}
