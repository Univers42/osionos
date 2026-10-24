/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ActivityTracking.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings, Privacy: the opt-in to the activity log behind Insights.
 *
 * The switch is the SERVER's state, read on mount and saved on every change; a save that fails
 * puts it back where the server has it and says why. It is OFF by default and does not touch
 * the recommender's beacon (RecommendationPrivacy).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Toggle, useToastStore } from "@/shared/ui";
import { readActivityTracking, writeActivityTracking } from "../api/activityTracking";
import { SettingRow } from "./settingsKit";

const TITLE = "Record my activity";
const NOTICE =
  "We keep an event name, a surface name, a workspace id and the time. Admins only ever see groups of 5 or more people.";
const OFF_NOTICE =
  "Turning it off stops new events within a minute. It does not delete past ones; deleting your account erases them.";

export const ActivityTracking: React.FC = () => {
  const toast = useToastStore((state) => state.push);
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const serverValue = useRef(false);

  useEffect(() => {
    let alive = true;
    void readActivityTracking().then((result) => {
      if (!alive) return;
      if (!result.ok) { setNote(result.message); return; }
      serverValue.current = result.enabled;
      setEnabled(result.enabled);
      setAvailable(true);
    });
    return () => { alive = false; };
  }, []);

  const onChange = useCallback(async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    const result = await writeActivityTracking(next);
    setSaving(false);
    if (!result.ok) {
      setEnabled(serverValue.current);
      toast({ kind: "error", title: "The switch did not change", description: result.message });
      return;
    }
    serverValue.current = result.enabled;
    setEnabled(result.enabled);
  }, [toast]);

  return (
    <SettingRow
      title={TITLE}
      description={
        <>
          {NOTICE}
          <span className="mt-1 block">{OFF_NOTICE}</span>
          {note && <span className="mt-1 block">{note}</span>}
        </>
      }
      action={<Toggle checked={enabled} disabled={!available || saving} onChange={(next) => void onChange(next)} label={TITLE} />}
    />
  );
};
