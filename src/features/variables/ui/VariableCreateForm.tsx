/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VariableCreateForm.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";

import { addVariable } from "../model/openEnvFile";
import { variablePlacement } from "../model/variableScope";

interface VariableCreateFormProps {
  pageId: string;
  workspaceId: string;
  name: string;
  onCreated: () => void;
  onCancel: () => void;
}

const WORKSPACE = "";

/** The value and env.json of a new `{{name}}`; the file the page already reads from is the default. */
export const VariableCreateForm: React.FC<VariableCreateFormProps> = ({ pageId, workspaceId, name, onCreated, onCancel }) => {
  const nearest = variablePlacement(pageId).owners[0];
  const places = [{ id: pageId, label: "This page and its sub-pages" }];
  if (nearest && nearest._id !== pageId) places.push({ id: nearest._id, label: `${nearest.title || "Untitled"} and its sub-pages` });
  places.push({ id: WORKSPACE, label: "Workspace" });

  const [value, setValue] = useState("");
  const [place, setPlace] = useState(nearest?._id ?? WORKSPACE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const why = await addVariable(workspaceId, place || undefined, name, value);
    setSaving(false);
    if (why) setError(why);
    else onCreated();
  };

  return (
    <form
      data-testid="variable-create"
      className="flex flex-col gap-2 p-2"
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }}
    >
      <p className="osio-menu-label px-0">
        New variable <span className="font-mono">{`{{${name}}}`}</span>
      </p>
      <label className="flex flex-col gap-1 text-xs text-[var(--osio-fg-muted)]">
        Value
        <input
          autoFocus
          aria-label="Value"
          className="osio-field px-1.5 text-sm text-[var(--osio-fg-default)] [--osio-field-h:var(--osio-control-h-sm)]"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--osio-fg-muted)]">
        Saved in env.json of
        <select
          aria-label="Saved in"
          className="osio-field px-1 text-sm text-[var(--osio-fg-default)] [--osio-field-h:var(--osio-control-h-sm)]"
          value={place}
          onChange={(event) => setPlace(event.target.value)}
        >
          {places.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-xs text-[var(--osio-danger)]">{error}</p>}
      <div className="flex justify-end gap-1">
        <button type="button" className="osio-control px-2 text-xs" onClick={onCancel}>Cancel</button>
        <button type="submit" className="osio-control px-2 text-xs" disabled={saving}>Create</button>
      </div>
    </form>
  );
};
