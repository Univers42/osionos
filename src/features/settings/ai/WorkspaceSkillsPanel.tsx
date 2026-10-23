/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceSkillsPanel.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI — the skills of a workspace: named procedures every assistant
 * run in it can load. Any member reads them; the service lets only owners and
 * admins write, and its refusal is shown in words.
 *
 * Caveat: the panel cannot tell a member from an admin before the first write
 * (the role is read live by the service), so the editing controls are always
 * shown and a member sees the refusal.
 */

import React, { useCallback, useEffect, useState } from "react";

import {
  archiveWorkspaceSkill,
  createWorkspaceSkill,
  isAiConfigured,
  listWorkspaceSkills,
  updateWorkspaceSkill,
  type AiWorkspaceSkill,
} from "@/features/ai/api/aiClient";
import {
  bodyCharsLeft,
  skillDraftProblem,
  skillFailureMessage,
  SKILL_BODY_MAX,
  type SkillDraft,
} from "@/features/ai/model/workspaceSkills";
import { FIELD_INPUT, FIELD_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON } from "./aiPanelClasses";
import type { AccessTokenWorkspace } from "./AccessTokensPanel";

const EMPTY: SkillDraft = { slug: "", name: "", description: "", body: "" };

export const WorkspaceSkillsPanel: React.FC<{ workspaces: AccessTokenWorkspace[] }> = ({ workspaces }) => {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [skills, setSkills] = useState<AiWorkspaceSkill[]>([]);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setSkills(await listWorkspaceSkills(workspaceId));
      setError("");
    } catch (failure) {
      setSkills([]);
      setError(skillFailureMessage(failure));
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isAiConfigured()) return;
    let live = true;
    listWorkspaceSkills(workspaceId).then(
      (list) => { if (live) { setSkills(list); setError(""); } },
      (failure) => { if (live) { setSkills([]); setError(skillFailureMessage(failure)); } },
    );
    return () => { live = false; };
  }, [workspaceId]);

  if (!isAiConfigured() || workspaces.length === 0) return null;

  const problem = draft ? skillDraftProblem(draft, editing === null) : null;
  const save = async () => {
    if (!draft || problem) return;
    try {
      const fields = { name: draft.name.trim(), description: draft.description.trim(), body: draft.body };
      if (editing) await updateWorkspaceSkill(workspaceId, editing, fields);
      else await createWorkspaceSkill(workspaceId, { slug: draft.slug, ...fields });
      setDraft(null);
      setEditing(null);
      await reload();
    } catch (failure) {
      setError(skillFailureMessage(failure));
    }
  };
  const archive = async (slug: string) => {
    try {
      await archiveWorkspaceSkill(workspaceId, slug);
      await reload();
    } catch (failure) {
      setError(skillFailureMessage(failure));
    }
  };

  return (
    <section aria-labelledby="ws-skills-title" className="mt-6">
      <h3 id="ws-skills-title" className="text-sm font-semibold text-[var(--osio-fg-default)]">Workspace skills</h3>
      <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
        Procedures the assistant can load in this workspace. Owners and admins write them; the text is treated as data, never as rules.
      </p>
      {workspaces.length > 1 && (
        <select aria-label="Workspace" className={FIELD_INPUT} value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setDraft(null); }}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-[var(--osio-danger)]">{error}</p>}
      <ul className="mt-3 space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded-md border border-[var(--osio-border-default)] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-[var(--osio-fg-default)]">{skill.name} <span className="text-xs text-[var(--osio-fg-muted)]">{skill.slug} · v{skill.version}</span></span>
              <span className="flex gap-1">
                <button type="button" className={SECONDARY_BUTTON} onClick={() => { setEditing(skill.slug); setDraft({ slug: skill.slug, name: skill.name, description: skill.description, body: skill.body }); }}>Edit</button>
                <button type="button" className={DANGER_BUTTON} onClick={() => void archive(skill.slug)}>Archive</button>
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">{skill.description}</p>
            {!skill.inIndex && <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">Not offered to the assistant: the skills list is full.</p>}
          </li>
        ))}
      </ul>
      {draft ? (
        <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {editing === null && (
            <label className={FIELD_LABEL}>Id<input className={FIELD_INPUT} value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></label>
          )}
          <label className={FIELD_LABEL}>Name<input className={FIELD_INPUT} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className={FIELD_LABEL}>Description (one line, shown to the assistant)<input className={FIELD_INPUT} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className={FIELD_LABEL}>Text<textarea rows={8} className={FIELD_INPUT} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
          <p className="text-xs text-[var(--osio-fg-muted)]" aria-live="polite">{bodyCharsLeft(draft.body)} of {SKILL_BODY_MAX} characters left</p>
          {problem && <p className="text-xs text-[var(--osio-danger)]">{problem}</p>}
          <div className="flex gap-2">
            <button type="submit" className={PRIMARY_BUTTON} disabled={problem !== null}>{editing ? "Save new version" : "Create skill"}</button>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => { setDraft(null); setEditing(null); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${SECONDARY_BUTTON} mt-3`} onClick={() => { setEditing(null); setDraft(EMPTY); }}>New skill</button>
      )}
    </section>
  );
};
