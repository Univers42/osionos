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

import type { PageEntry } from "@/entities/page";
import type { UserPreferences } from "@/store/settings/types";
import { useUserPreferencesStore } from "@/store/settings/useUserPreferencesStore";
import { usePageStore } from "@/store/usePageStore";

import { resolveVariable, type VariableLayer, type VariableScope } from "./variableResolver";
import type { FormatContext } from "./variableFormat";
import { useVariablesStore, type EnvFile } from "./useVariablesStore";

const NUMBER_LOCALES: Record<string, string> = { dot: "en-US", comma: "de-DE", space: "fr-FR" };
const ROOT = "";
// A parentPageId cycle in bad data must not hang a render.
const MAX_CHAIN = 64;
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

const layersByParent = new WeakMap<readonly EnvFile[], Map<string, VariableLayer>>();

function envLayers(files: readonly EnvFile[]): Map<string, VariableLayer> {
  let byParent = layersByParent.get(files);
  if (!byParent) {
    // Two env.json files under one page: the first wins, as findEnvPage picks it.
    byParent = new Map();
    for (const file of files) if (!byParent.has(file.parentPageId ?? ROOT)) byParent.set(file.parentPageId ?? ROOT, file.definitions);
    layersByParent.set(files, byParent);
  }
  return byParent;
}

function pageChain(pageId: string): PageEntry[] {
  const { pageById } = usePageStore.getState();
  const chain: PageEntry[] = [];
  for (let page = pageById(pageId); page && chain.length < MAX_CHAIN; page = page.parentPageId ? pageById(page.parentPageId) : undefined) {
    chain.push(page);
  }
  return chain;
}

export interface VariablePlacement extends Pick<VariableScope, "layers" | "pages"> {
  /** The page each layer's env.json sits under, parallel to `layers`; null is the workspace's. */
  owners: readonly (PageEntry | null)[];
}
const NOWHERE: VariablePlacement = { layers: [], pages: [], owners: [] };

// Every chip of a render asks for the same page; the page store and env files are
// replaced, never mutated, so their identities key the memo.
let placementFor: { pageId: string; pages: unknown; files: unknown; placement: VariablePlacement } | undefined;

/** The page, its ancestors, and the env.json layers that apply to it, innermost first. */
export function variablePlacement(pageId: string | undefined): VariablePlacement {
  if (!pageId) return NOWHERE;
  const pages = usePageStore.getState().pages;
  const files = useVariablesStore.getState().byWorkspace;
  if (placementFor && placementFor.pageId === pageId && placementFor.pages === pages && placementFor.files === files) return placementFor.placement;
  const chain = pageChain(pageId);
  const byParent = chain[0] ? envLayers(files[chain[0].workspaceId] ?? []) : undefined;
  const layers: VariableLayer[] = [];
  const owners: (PageEntry | null)[] = [];
  for (const owner of byParent ? [...chain, null] : []) {
    const layer = byParent?.get(owner?._id ?? ROOT);
    if (!layer) continue;
    layers.push(layer);
    owners.push(owner);
  }
  const result = { layers, pages: chain, owners };
  placementFor = { pageId, pages, files, placement: result };
  return result;
}

/** The scope a block of `pageId` resolves in: its page and ancestors, the env.json files over them, the user's preferences. */
export function variableScopeFor(pageId: string | undefined, now = new Date()): VariableScope {
  const preferences = useUserPreferencesStore.getState().data;
  return {
    ...variablePlacement(pageId),
    context: { ...preferenceContext(preferences), now },
    dateFormat: preferences?.dateFormat ?? "relative",
  };
}

/** The engine's `resolveVariable` hook, bound to one page. */
export function variableResolverFor(pageId: string | undefined): (expr: string) => ResolvedVariable | null {
  return (expr) => resolveVariable(expr, variableScopeFor(pageId));
}
