/* ************************************************************************** */
/*                                                                            */
/*   LibrarySkills.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { listWorkspaceSkills, type AiWorkspaceSkill } from "@/features/ai/api/aiClient";
import { formatRelativeTime } from "@/shared/lib/relativeTime";
import { LIBRARY_GRID } from "./LibraryTree";

type SkillsState =
  | { status: "loading" }
  | { status: "ready"; skills: AiWorkspaceSkill[] }
  | { status: "error"; message: string };

/** The Skills tab: workspace skills, no tree. Keyed by workspace so a switch
 *  starts from a fresh loading state instead of setState inside the effect. */
export const LibrarySkills: React.FC<{ workspaceId: string }> = ({ workspaceId }) => (
  <LibrarySkillsRows key={workspaceId} workspaceId={workspaceId} />
);

const LibrarySkillsRows: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [state, setState] = useState<SkillsState>(() =>
    workspaceId ? { status: "loading" } : { status: "ready", skills: [] },
  );

  useEffect(() => {
    if (!workspaceId) return undefined;
    let alive = true;
    listWorkspaceSkills(workspaceId)
      .then((skills) => { if (alive) setState({ status: "ready", skills }); })
      .catch((error: unknown) => {
        if (alive) setState({ status: "error", message: error instanceof Error ? error.message : "Could not load skills" });
      });
    return () => { alive = false; };
  }, [workspaceId]);

  if (state.status === "loading") {
    return <p role="status" className="px-3 py-6 text-sm text-[var(--osio-fg-muted)]">Loading skills…</p>;
  }
  if (state.status === "error") {
    return <p role="alert" className="px-3 py-6 text-sm text-[var(--osio-danger)]">{state.message}</p>;
  }
  if (state.skills.length === 0) {
    return <p className="px-3 py-6 text-sm text-[var(--osio-fg-muted)]">No workspace skills yet.</p>;
  }

  return (
    <div className="min-w-[720px]">
      <div className={`${LIBRARY_GRID} h-8 border-b border-[var(--osio-border-default)] text-xs font-medium text-[var(--osio-fg-muted)]`}>
        <div className="truncate px-2">Skill name</div>
        <div className="col-span-3 truncate px-2">Description</div>
        <div className="truncate px-2">Last edited</div>
      </div>
      {state.skills.map((skill) => (
        <div key={skill.id} className={`${LIBRARY_GRID} h-8 border-b border-[var(--osio-border-soft)] text-sm`} data-testid="library-skill-row">
          <div className="flex min-w-0 items-center gap-1.5 px-2 text-[var(--osio-fg-default)]">
            <Sparkles size={14} className="shrink-0 text-[var(--osio-fg-muted)]" aria-hidden="true" />
            <span className="truncate">{skill.name}</span>
          </div>
          <div className="col-span-3 truncate px-2 text-[var(--osio-fg-muted)]">{skill.description || "—"}</div>
          <div className="truncate px-2 text-[var(--osio-fg-muted)]">{formatRelativeTime(skill.updatedAt) || "—"}</div>
        </div>
      ))}
    </div>
  );
};
