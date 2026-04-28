/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditorConstants.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export const CALLOUT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '💡': { bg: 'bg-amber-100',  border: 'border-amber-300',  text: 'text-amber-950' },
  '⚠️': { bg: 'bg-amber-100',  border: 'border-amber-400',  text: 'text-amber-950' },
  '❗': { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-950' },
  '📌': { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-950' },
  '✅': { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-950' },
  '❌': { bg: 'bg-rose-100',   border: 'border-rose-300',   text: 'text-rose-950' },
  'ℹ️': { bg: 'bg-sky-100',    border: 'border-sky-300',    text: 'text-sky-950' },
  '🔥': { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-950' },
  '💬': { bg: 'bg-slate-100',  border: 'border-slate-300',  text: 'text-slate-900' },
  '📝': { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-950' },
  '🎯': { bg: 'bg-cyan-100',   border: 'border-cyan-300',   text: 'text-cyan-950' },
  '⭐': { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-950' },
};

export const CONTAINER_HEADING_CLASSES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight",
  2: "text-xl font-semibold text-[var(--color-ink)] mt-5 mb-1 leading-tight",
  3: "text-lg font-semibold text-[var(--color-ink)] mt-4 mb-0.5 leading-snug",
  4: "text-base font-semibold text-[var(--color-ink)] mt-3 mb-0.5 leading-snug",
  5: "text-sm font-semibold text-[var(--color-ink)] mt-2 mb-0.5 leading-snug",
  6: "text-xs font-semibold text-[var(--color-ink-muted)] mt-2 mb-0.5 leading-snug tracking-wide",
};
