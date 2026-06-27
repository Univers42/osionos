/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AppMark.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/**
 * The assistant's ORIGINAL identity mark (§7) — an abstract spark/peak glyph in
 * the app's accent. NOT a reproduction of any third-party (Anthropic/OpenAI/…)
 * logo; per-connector branding uses each provider's own asset elsewhere.
 */
export const AppMark: React.FC<{ size?: number; className?: string }> = ({ size = 40, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="Assistant">
    <defs>
      <linearGradient id="osio-appmark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--osio-accent)" />
        <stop offset="100%" stopColor="var(--osio-accent-hover, var(--osio-accent))" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="42" height="42" rx="13" fill="url(#osio-appmark)" />
    <path
      d="M15 31 L24 13 L33 31 M18.6 25 H29.4"
      fill="none"
      stroke="var(--osio-accent-fg)"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
