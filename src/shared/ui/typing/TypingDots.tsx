/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TypingDots.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/**
 * Three dots that say "someone is writing". Decorative: the caller carries the
 * words for a screen reader. The loop lives in collab-activity.css and only runs
 * when neither the OS nor the in-app Reduce motion choice asks for stillness; the
 * dots then stand still.
 */
export const TypingDots: React.FC<{ className?: string }> = ({ className }) => (
  <span aria-hidden="true" data-testid="typing-dots" className={`inline-flex items-center gap-[3px] ${className ?? ""}`}>
    <span className="collab-typing-dot h-1 w-1 rounded-full bg-current" />
    <span className="collab-typing-dot h-1 w-1 rounded-full bg-current" />
    <span className="collab-typing-dot h-1 w-1 rounded-full bg-current" />
  </span>
);
