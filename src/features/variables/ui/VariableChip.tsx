/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VariableChip.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { usePageStore } from "@/store/usePageStore";

import { useVariablesStore } from "../model/useVariablesStore";
import { resolveVariable } from "../model/variableResolver";
import { variableScopeFor } from "../model/variableScope";

/**
 * Read-only surfaces (previews, callouts, table cells) do not know which page they
 * belong to, so they resolve against the open page.
 * Caveat: a hover preview of ANOTHER page shows `{{page.X}}` / `{{PAGE}}` from the open
 * page, and its workspace's env.json — wrong only when the two pages differ.
 */
export function resolveVariableInActivePage(expr: string) {
  return resolveVariable(expr, variableScopeFor(usePageStore.getState().activePage?.id));
}

/** The variables version, or a constant 0 when `content` holds no `{{` (no re-renders). */
export function useVariablesVersion(content: string | undefined): number {
  return useVariablesStore((s) => (content?.includes("{{") ? s.version : 0));
}

export function VariableChip({ expr }: Readonly<{ expr: string }>) {
  useVariablesStore((s) => s.version);
  const resolved = resolveVariableInActivePage(expr);
  if (!resolved) return <>{`{{${expr}}}`}</>;
  const className = resolved.error ? "md-variable md-variable-error" : "md-variable";
  const title = resolved.error ? `{{${expr.trim()}}} — ${resolved.error}` : `{{${expr.trim()}}}`;
  return (
    <span className={className} data-inline-type="variable" title={title}>
      {resolved.text}
    </span>
  );
}

export function renderVariableChip(expr: string): React.ReactNode {
  return <VariableChip expr={expr} />;
}
