/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThreadMoodHint.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one muted line on top of a comment thread: the mood of the thread, when the
 * workspace opted in and at least 5 people wrote in it (C140). It is fetched once,
 * when the thread opens, and any failure is no hint — never an error in the panel.
 */

import React, { useEffect, useState } from "react";

import { getThreadMood } from "@/features/ai/api/sentiment";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { threadMoodLine, type ThreadMood } from "@/features/ai/model/sentimentPulse";

export const ThreadMoodHint: React.FC<{ pageId: string }> = ({ pageId }) => {
  const [mood, setMood] = useState<ThreadMood | null>(null);

  useEffect(() => {
    if (!isAiConfigured()) return undefined;
    let alive = true;
    getThreadMood(pageId)
      .then((answer) => { if (alive) setMood(answer); })
      .catch(() => { if (alive) setMood(null); });
    return () => { alive = false; };
  }, [pageId]);

  if (!mood) return null;
  return (
    <p
      className="px-3 pt-2 text-3xs text-[var(--osio-fg-subtle)]"
      title="An aggregate of the tone of the comments, shown only when at least 5 people wrote in this thread. It is never shown per person."
    >
      {threadMoodLine(mood)}
    </p>
  );
};
