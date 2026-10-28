/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EnvFileStatus.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { useVariablesStore } from "../model/useVariablesStore";

const NO_ERRORS: readonly string[] = [];
const SHOWN = 5;

/**
 * The entries env.json skipped, under its editor. A bad entry is dropped so the rest
 * still load, and without this the writer would only see `{{NAME}}` stay literal.
 * Renders nothing for any other code page.
 */
export const EnvFileStatus: React.FC<{ pageId: string }> = ({ pageId }) => {
  const errors = useVariablesStore(
    (s) => Object.values(s.byWorkspace).find((entry) => entry.pageId === pageId)?.errors ?? NO_ERRORS,
  );
  if (errors.length === 0) return null;
  return (
    <div role="status" className="shrink-0 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-1 text-xs text-[var(--osio-code-fg)]">
      <p className="flex items-center gap-2">
        <AlertTriangle size={12} aria-hidden className="shrink-0 text-[var(--osio-warning)]" />
        {errors.length === 1 ? "1 entry was skipped" : `${errors.length} entries were skipped`}; the others are in use.
      </p>
      <ul className="mt-0.5 list-disc pl-8 font-mono text-2xs text-[var(--osio-code-fg-muted)]">
        {errors.slice(0, SHOWN).map((error) => <li key={error}>{error}</li>)}
        {errors.length > SHOWN && <li>…and {errors.length - SHOWN} more</li>}
      </ul>
    </div>
  );
};
