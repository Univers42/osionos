/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageDividers.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/** A day boundary in the timeline: a centred pill on a hairline. */
export const DateDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="my-3 flex items-center gap-3" role="separator" aria-label={label}>
    <span className="h-px flex-1 bg-[var(--osio-border-default)]" />
    <span className="rounded-full bg-[var(--osio-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--osio-fg-muted)]">{label}</span>
    <span className="h-px flex-1 bg-[var(--osio-border-default)]" />
  </div>
);

/** Where the reader left off. */
export const UnreadDivider: React.FC = () => (
  <div className="my-2 flex items-center gap-3" role="separator" aria-label="New messages">
    <span className="h-px flex-1 bg-[var(--osio-accent)]" />
    <span className="rounded-full bg-[var(--osio-accent)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--osio-accent-fg)]">New</span>
    <span className="h-px flex-1 bg-[var(--osio-accent)]" />
  </div>
);
