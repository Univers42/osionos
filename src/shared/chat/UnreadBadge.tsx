/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UnreadBadge.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Right-aligned unread count pill for the channel / DM lists (null when 0). */

import React from 'react';

export const UnreadBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent)] px-1 text-[10px] font-semibold text-[var(--osio-accent-fg)]"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
