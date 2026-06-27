/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WaveBars.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A row of vertical bars from real amplitude values (0..1) — the recorder's live
 * envelope or a clip's decoded peaks. With `progress` (0..1) the played portion
 * stays accent-coloured and the rest dims, so playback reads like a real player.
 */

import React from 'react';

interface WaveBarsProps {
  values: number[];
  progress?: number;
}

export const WaveBars: React.FC<WaveBarsProps> = ({ values, progress }) => (
  <div className="flex h-7 min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-hidden>
    {values.map((value, index) => {
      const played = progress == null || index / Math.max(values.length - 1, 1) <= progress;
      return (
        <span
          key={index}
          className={`w-1 shrink-0 rounded-full ${played ? 'bg-[var(--osio-accent)]' : 'bg-[var(--osio-fg-subtle)]'}`}
          style={{ height: `${Math.max(10, Math.min(100, value * 140))}%` }}
        />
      );
    })}
  </div>
);
