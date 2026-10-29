/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SentimentSection.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI › Sentiment (M6): the opt-in switch of the workspace, and the
 * Pulse under it once it is on. Only a live owner or admin can switch it; the
 * service says so with a 403, and the section says it in words.
 */

import React, { useEffect, useState } from "react";

import { AiError } from "@/features/ai/api/aiContract";
import { getPulse, getSentimentSettings, setSentimentEnabled } from "@/features/ai/api/sentiment";
import type { Pulse } from "@/features/ai/model/sentimentPulse";
import { invalidateSentimentOptIn } from "@/features/settings/ai/sentimentOptInCache";
import { Toggle } from "@/shared/ui";
import { SettingRow } from "../ui/settingsKit";
import { SentimentPulseChart } from "./SentimentPulseChart";

export const SENTIMENT_EXPLANATION =
  "Off by default. When on, comments in this workspace are scored negative / neutral / positive by a model running on our servers. Results are shown only as weekly totals of at least 5 people, never per person. Turning it off deletes every score.";

export const ADMIN_ONLY = "Only a workspace owner or admin can change this.";

const failure = (error: unknown): string => {
  if (error instanceof AiError && error.status === 403) return ADMIN_ONLY;
  return error instanceof Error ? error.message : "The request failed.";
};

interface Loaded {
  enabled: boolean;
  pulse: Pulse | null;
}

const fetchLoaded = async (workspaceId: string): Promise<Loaded> => {
  const enabled = await getSentimentSettings(workspaceId);
  return { enabled, pulse: enabled ? await getPulse(workspaceId) : null };
};

export const SentimentSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchLoaded(workspaceId)
      .then((answer) => { if (alive) { setLoaded(answer); setError(null); } })
      .catch((thrown: unknown) => { if (alive) setError(failure(thrown)); });
    return () => { alive = false; };
  }, [workspaceId, reloads]);

  const change = (next: boolean): void => {
    setSentimentEnabled(workspaceId, next)
      .then(() => { invalidateSentimentOptIn(workspaceId); setReloads((count) => count + 1); })
      .catch((thrown: unknown) => setError(failure(thrown)));
  };

  return (
    <>
      <SettingRow
        title="Sentiment"
        description={SENTIMENT_EXPLANATION}
        action={<Toggle checked={loaded?.enabled === true} disabled={loaded === null} onChange={change} label="Sentiment" />}
      />
      {error && <p role="alert" className="mt-1 text-2xs text-[var(--osio-danger)]">{error}</p>}
      {loaded?.pulse?.enabled ? <SentimentPulseChart pulse={loaded.pulse} /> : null}
    </>
  );
};
