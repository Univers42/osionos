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

import React, { useState } from "react";
import { useUserStore } from "@/features/auth";
import { socialAvailable } from "@/shared/social/followApi";
import { getPresenceSetting, setPresenceSetting } from "@/shared/people/usePresenceHeartbeat";
import { Section, SettingRow } from "../ui/settingsKit";
import { PRESENCE_CHOICES, checkPresenceText, isPresenceChoice, presenceLabel, type PresenceChoice } from "../model/peopleSocialModel";
import { StatusPanel } from "../profile/StatusPanel";

const FIELD =
  "h-9 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

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
          <select name="presence" aria-label="Presence" value={state} className={FIELD}
            onChange={(event) => { const next = event.target.value as PresenceChoice; setState(next); apply(next, note); }}>
            {PRESENCE_CHOICES.map((choice) => <option key={choice} value={choice}>{presenceLabel(choice)}</option>)}
          </select>
          <input name="presence-note" aria-label="Presence note" placeholder="Note (optional)" value={note} className={FIELD}
            onChange={(event) => setNote(event.target.value)} onBlur={() => apply(state, note)} />
          {error && <span role="alert" className="text-xs text-[var(--osio-danger)]">{error}</span>}
        </>
      )} />
  );
};

export const PresenceStatusControls: React.FC = () => {
  const userId = useUserStore((state) => state.activeUserId);
  if (!socialAvailable() || !userId) return null;
  return (
    <Section title="Presence and status" anchor="presence-status">
      <PresencePicker />
      <StatusPanel userId={userId} />
    </Section>
  );
};
