/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfessionPickerModal.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "What do you do?" — the one place a profession is picked.
 *
 * The eight professions are a code definition, not a stored page: picking one writes a
 * column on the account profile and the profile and Home templates follow from it.
 */

import React from "react";
import { Modal } from "@osionos/ui/primitives/Modal";
import { PROFESSIONS, type ProfessionId } from "@/data/professions/professions";
import { useProfessionStore } from "../model/useProfessionStore";

export const ProfessionPickerModal: React.FC = () => {
  const open = useProfessionStore((s) => s.open);
  const busy = useProfessionStore((s) => s.busy);
  const setOpen = useProfessionStore((s) => s.setOpen);
  const pick = useProfessionStore((s) => s.pick);

  const choose = async (id: ProfessionId) => {
    await pick(id);
    // A refused pick keeps the modal open: the member has not chosen anything yet.
    if (!useProfessionStore.getState().error) setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) setOpen(false); }}
      title="What do you do?"
      description="Your profession shapes your profile and your Home dashboard. You can change it later."
      size="md"
    >
      <div className="p-6">
        <div className="-m-1 flex max-h-[min(60dvh,32rem)] flex-col gap-3 overflow-y-auto p-1">
        {PROFESSIONS.map((profession) => (
          <button
            key={profession.id}
            type="button"
            disabled={busy}
            onClick={() => void choose(profession.id)}
            className="group flex items-center gap-4 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-left transition-[border-color,background-color] duration-(--osio-dur-base) hover:border-[var(--osio-accent)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-xl text-[var(--osio-accent)] transition-colors duration-(--osio-dur-base) group-hover:bg-[var(--osio-accent)]"
            >
              {profession.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[var(--osio-fg-default)]">{profession.label}</span>
              <span className="block text-sm text-[var(--osio-fg-muted)]">{profession.desc}</span>
            </span>
          </button>
        ))}
        </div>
        {busy && <p className="mt-3 text-center text-xs text-[var(--osio-fg-subtle)]">Saving your profession…</p>}
      </div>
    </Modal>
  );
};
