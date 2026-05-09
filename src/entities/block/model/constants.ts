/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   constants.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 16:29:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export const CALLOUT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '💡': { bg: 'bg-[var(--osio-block-tint-yellow-bg)]', border: 'border-[var(--osio-block-tint-yellow-fg)]', text: 'text-[var(--osio-block-tint-yellow-fg)]' },
  '⚠️': { bg: 'bg-[var(--osio-block-tint-yellow-bg)]', border: 'border-[var(--osio-block-tint-yellow-fg)]', text: 'text-[var(--osio-block-tint-yellow-fg)]' },
  '❗': { bg: 'bg-[var(--osio-block-tint-purple-bg)]', border: 'border-[var(--osio-block-tint-purple-fg)]', text: 'text-[var(--osio-block-tint-purple-fg)]' },
  '📌': { bg: 'bg-[var(--osio-block-tint-blue-bg)]', border: 'border-[var(--osio-block-tint-blue-fg)]', text: 'text-[var(--osio-block-tint-blue-fg)]' },
  '✅': { bg: 'bg-[var(--osio-block-tint-green-bg)]', border: 'border-[var(--osio-block-tint-green-fg)]', text: 'text-[var(--osio-block-tint-green-fg)]' },
  '❌': { bg: 'bg-[var(--osio-block-tint-red-bg)]', border: 'border-[var(--osio-block-tint-red-fg)]', text: 'text-[var(--osio-block-tint-red-fg)]' },
  'ℹ️': { bg: 'bg-[var(--osio-block-tint-blue-bg)]', border: 'border-[var(--osio-block-tint-blue-fg)]', text: 'text-[var(--osio-block-tint-blue-fg)]' },
  '🔥': { bg: 'bg-[var(--osio-block-tint-orange-bg)]', border: 'border-[var(--osio-block-tint-orange-fg)]', text: 'text-[var(--osio-block-tint-orange-fg)]' },
  '💬': { bg: 'bg-[var(--osio-block-tint-gray-bg)]', border: 'border-[var(--osio-block-tint-gray-fg)]', text: 'text-[var(--osio-block-tint-gray-fg)]' },
  '📝': { bg: 'bg-[var(--osio-block-tint-purple-bg)]', border: 'border-[var(--osio-block-tint-purple-fg)]', text: 'text-[var(--osio-block-tint-purple-fg)]' },
  '🎯': { bg: 'bg-[var(--osio-block-tint-blue-bg)]', border: 'border-[var(--osio-block-tint-blue-fg)]', text: 'text-[var(--osio-block-tint-blue-fg)]' },
  '⭐': { bg: 'bg-[var(--osio-block-tint-yellow-bg)]', border: 'border-[var(--osio-block-tint-yellow-fg)]', text: 'text-[var(--osio-block-tint-yellow-fg)]' },
};
