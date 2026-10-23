/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PresenceStatusControls.tsx                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/** The owner's side of presence and status: pick online / away / do not disturb /
 *  invisible (the heartbeat carries it) and set the emoji, text, expiry and busy flag
 *  others see on the card. Hidden when the build has no bridge or no session. */

import React, { useEffect, useState } from "react";
import { Button } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { fetchPersonCard, saveOwnStatus, socialAvailable } from "@/shared/social/followApi";
import { getPresenceSetting, setPresenceSetting } from "@/shared/people/usePresenceHeartbeat";
import { Section, SettingRow } from "../ui/settingsKit";
import {
  PRESENCE_CHOICES, checkPresenceText, isPresenceChoice, presenceLabel, validateStatus,
  type PresenceChoice, type StatusDraft,
} from "../people/peopleSocialModel";

const FIELD =
  "h-9 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

const EXPIRY_CHOICES = [
  { label: "Never", minutes: 0 },
  { label: "In 30 minutes", minutes: 30 },
  { label: "In 1 hour", minutes: 60 },
  { label: "In 4 hours", minutes: 240 },
  { label: "In 24 hours", minutes: 1440 },
];

const EMPTY: StatusDraft = { emoji: "", text: "", expiresAt: "", busy: false };

const PresencePicker: React.FC = () => {
  const initial = getPresenceSetting();
  const [state, setState] = useState<PresenceChoice>(initial?.state && isPresenceChoice(initial.state) ? initial.state : "online");
  const [note, setNote] = useState(initial?.customText ?? "");
  const [error, setError] = useState<string | null>(null);

  const apply = (nextState: PresenceChoice, nextNote: string) => {
    const checked = checkPresenceText(nextNote);
    if (!checked.ok) { setError(checked.message); return; }
    setError(null);
    setPresenceSetting({ state: nextState, customText: checked.text });
  };

  return (
    <SettingRow title="Presence" description="Invisible shows you as offline to everyone else."
      action={(
        <>
          <select aria-label="Presence" value={state} className={FIELD}
            onChange={(event) => { const next = event.target.value as PresenceChoice; setState(next); apply(next, note); }}>
            {PRESENCE_CHOICES.map((choice) => <option key={choice} value={choice}>{presenceLabel(choice)}</option>)}
          </select>
          <input aria-label="Presence note" placeholder="Note (optional)" value={note} className={FIELD}
            onChange={(event) => setNote(event.target.value)} onBlur={() => apply(state, note)} />
          {error && <span role="alert" className="text-xs text-[var(--osio-danger)]">{error}</span>}
        </>
      )} />
  );
};

const StatusEditor: React.FC<{ userId: string }> = ({ userId }) => {
  const [draft, setDraft] = useState<StatusDraft>(EMPTY);
  const [minutes, setMinutes] = useState(0);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetchPersonCard(userId).then((card) => {
      if (live && card?.status) setDraft({ emoji: card.status.emoji ?? "", text: card.status.text ?? "", expiresAt: "", busy: card.status.busy });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [userId]);

  const save = async (next: StatusDraft) => {
    const now = Date.now();
    const expiresAt = minutes > 0 ? new Date(now + minutes * 60_000).toISOString() : "";
    const checked = validateStatus({ ...next, expiresAt }, now);
    if (!checked.ok) { setMessage({ kind: "error", text: checked.message }); return; }
    try {
      await saveOwnStatus(checked.body);
      setMessage({ kind: "ok", text: checked.body.text || checked.body.emoji ? "Status saved." : "Status cleared." });
    } catch {
      setMessage({ kind: "error", text: "Could not save your status. Try again." });
    }
  };
  const clear = () => { setDraft(EMPTY); setMinutes(0); void save(EMPTY); };

  return (
    <SettingRow stack title="Status" description="Shown on your card. It disappears by itself at the time you choose."
      action={(
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void save(draft); }}>
          <input aria-label="Status emoji" placeholder="🙂" value={draft.emoji} className={`${FIELD} w-16`}
            onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} />
          <input aria-label="Status text" placeholder="What are you up to?" value={draft.text} className={`${FIELD} min-w-[200px]`}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
          <select aria-label="Clear status" value={minutes} className={FIELD} onChange={(event) => setMinutes(Number(event.target.value))}>
            {EXPIRY_CHOICES.map((choice) => <option key={choice.minutes} value={choice.minutes}>{choice.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-[var(--osio-fg-default)]">
            <input type="checkbox" checked={draft.busy} onChange={(event) => setDraft({ ...draft, busy: event.target.checked })} /> Busy
          </label>
          <Button type="submit" tone="primary">Save status</Button>
          <Button onClick={clear}>Clear</Button>
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"}
              className={`text-xs ${message.kind === "error" ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-muted)]"}`}>{message.text}</span>
          )}
        </form>
      )} />
  );
};

export const PresenceStatusControls: React.FC = () => {
  const userId = useUserStore((state) => state.activeUserId);
  if (!socialAvailable() || !userId) return null;
  return (
    <Section title="Presence and status" anchor="presence-status">
      <PresencePicker />
      <StatusEditor userId={userId} />
    </Section>
  );
};
