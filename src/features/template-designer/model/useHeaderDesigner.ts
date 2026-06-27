/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useHeaderDesigner.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useState } from "react";

import type { HeaderSlot, HeaderSlotKind, HeaderTemplate } from "@/entities/page/model/headerTemplate";

const clone = (t: HeaderTemplate): HeaderTemplate => JSON.parse(JSON.stringify(t)) as HeaderTemplate;
const slotId = () => `slot-${Math.random().toString(36).slice(2, 9)}`;

/** Editable draft of a HeaderTemplate + structural mutations (reorder/rebind/add/remove). */
export function useHeaderDesigner(initial: HeaderTemplate) {
  const [draft, setDraft] = useState<HeaderTemplate>(() => clone(initial));

  /** Move a slot from (region, index) to (region, index) — across regions allowed. */
  const moveSlot = useCallback((fromR: number, fromI: number, toR: number, toI: number) => {
    setDraft((d) => {
      const regions = d.regions.map((r) => ({ ...r, slots: [...r.slots] }));
      if (!regions[fromR] || !regions[toR]) return d;
      const [moved] = regions[fromR].slots.splice(fromI, 1);
      if (!moved) return d;
      const at = Math.min(Math.max(0, toI), regions[toR].slots.length);
      regions[toR].slots.splice(at, 0, moved);
      return { ...d, regions };
    });
  }, []);

  const updateSlot = useCallback((ri: number, si: number, patch: Partial<HeaderSlot>) => {
    setDraft((d) => ({
      ...d,
      regions: d.regions.map((r, i) => (i !== ri ? r : { ...r, slots: r.slots.map((s, j) => (j !== si ? s : { ...s, ...patch })) })),
    }));
  }, []);

  const addSlot = useCallback((ri: number, kind: HeaderSlotKind) => {
    setDraft((d) => ({
      ...d,
      regions: d.regions.map((r, i) => (i !== ri ? r : { ...r, slots: [...r.slots, { id: slotId(), kind }] })),
    }));
  }, []);

  const removeSlot = useCallback((ri: number, si: number) => {
    setDraft((d) => ({
      ...d,
      regions: d.regions.map((r, i) => (i !== ri ? r : { ...r, slots: r.slots.filter((_, j) => j !== si) })),
    }));
  }, []);

  return { draft, moveSlot, updateSlot, addSlot, removeSlot };
}
