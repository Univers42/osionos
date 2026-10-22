/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accessTokenCreateForm.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Loader2 } from "lucide-react";

import type { AiAccessScope } from "@/features/ai/api/aiClient";
import { FIELD_INPUT, FIELD_LABEL, PRIMARY_BUTTON } from "./aiPanelClasses";

/** The days a token may live: the choices the panel offers. */
const EXPIRY_CHOICES = [7, 30, 90, 365];

/** The scopes the panel offers, with the words that say what they reach. */
const SCOPE_CHOICES: { id: AiAccessScope; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "write_approval", label: "Propose changes (you approve each one in osionos)" },
];

/** The form that mints a token. */
export const CreateTokenForm: React.FC<{
  workspaces: { id: string; name: string }[];
  name: string;
  setName: (value: string) => void;
  scopes: AiAccessScope[];
  toggleScope: (scope: AiAccessScope) => void;
  workspaceIds: string[];
  toggleWorkspace: (id: string) => void;
  expiresInDays: number;
  setExpiresInDays: (days: number) => void;
  canSubmit: boolean;
  busy: string;
  onSubmit: () => void;
}> = ({
  workspaces, name, setName, scopes, toggleScope, workspaceIds, toggleWorkspace,
  expiresInDays, setExpiresInDays, canSubmit, busy, onSubmit,
}) => (
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
        <h5 className="text-sm font-medium text-[var(--osio-fg-default)]">Create a token</h5>
        <div className="mt-3 space-y-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="pat-name">
              Name
            </label>
            <input
              id="pat-name"
              type="text"
              maxLength={64}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My agent"
              className={FIELD_INPUT}
            />
          </div>

          <fieldset>
            <legend className={FIELD_LABEL}>What the token may do</legend>
            <div className="mt-1 space-y-1.5">
              {SCOPE_CHOICES.map((choice) => (
                <label key={choice.id} className="flex items-start gap-2 text-sm text-[var(--osio-fg-default)]">
                  <input
                    type="checkbox"
                    checked={scopes.includes(choice.id)}
                    onChange={() => toggleScope(choice.id)}
                    className="mt-0.5"
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={FIELD_LABEL}>Workspaces</legend>
            {workspaces.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
                You are not a member of a workspace yet.
              </p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {workspaces.map((workspace) => (
                  <label
                    key={workspace.id}
                    className="flex items-start gap-2 text-sm text-[var(--osio-fg-default)]"
                  >
                    <input
                      type="checkbox"
                      checked={workspaceIds.includes(workspace.id)}
                      onChange={() => toggleWorkspace(workspace.id)}
                      className="mt-0.5"
                    />
                    <span>{workspace.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div>
            <label className={FIELD_LABEL} htmlFor="pat-expiry">
              Expires after
            </label>
            <select
              id="pat-expiry"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              className={FIELD_INPUT}
            >
              {EXPIRY_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSubmit()}
              disabled={!canSubmit || busy === "create"}
              className={PRIMARY_BUTTON}
            >
              {busy === "create" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Create token
            </button>
            {!canSubmit ? (
              <span className="text-xs text-[var(--osio-fg-muted)]">
                A name, a scope and at least one workspace are needed.
              </span>
            ) : null}
          </div>
        </div>
      </div>
);
