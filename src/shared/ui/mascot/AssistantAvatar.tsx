/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AssistantAvatar.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { BinocleMascot } from "./BinocleMascot";
import type { BinocleMood } from "./BinocleMascot";

interface Props {
  size?: number;
  mood?: BinocleMood;
}

/** The general assistant's face: the binocle on a soft disc. Shared by the AI chat and the AI answers in a channel. */
export const AssistantAvatar: React.FC<Props> = ({ size = 28, mood = "curious" }) => (
  <span
    aria-hidden="true"
    data-testid="assistant-avatar"
    style={{ width: size, height: size }}
    className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-bg-subtle)] ring-1 ring-[color-mix(in_srgb,var(--osio-accent)_30%,transparent)]"
  >
    <BinocleMascot mood={mood} size={Math.round(size * 0.86)} />
  </span>
);
