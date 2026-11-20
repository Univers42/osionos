/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ApplyTemplateDialog.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { ApplyMode } from "@/features/templates/model/applyToPage";

type ApplyChoice = ApplyMode | "cancel";
interface ApplyTemplateDialogProps {
  templateTitle: string;
  pageTitle: string;
  onChoose: (choice: ApplyChoice) => void;
}

const BUTTON_BASE = "rounded-md px-3 py-1.5 text-sm transition-colors";

/** Focus the safe choice and let Escape cancel from anywhere in the modal. */
function useDialogSetup(onChoose: (choice: ApplyChoice) => void, initialFocus: React.RefObject<HTMLButtonElement | null>): void {
  useEffect(() => {
    initialFocus.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChoose("cancel");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [initialFocus, onChoose]);
}

/** Tab wraps in both directions; other tabs use the buttons' browser order. */
function trapTab(event: React.KeyboardEvent<HTMLDivElement>, first: HTMLElement | null, last: HTMLElement | null): void {
  if (event.key !== "Tab" || !first || !last) return;
  const forward = !event.shiftKey && document.activeElement === last;
  const backward = event.shiftKey && document.activeElement === first;
  if (!forward && !backward) return;
  event.preventDefault();
  (forward ? first : last).focus();
}

interface ChoiceButtonProps {
  label: string;
  choice: ApplyChoice;
  className: string;
  onChoose: (choice: ApplyChoice) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

function ChoiceButton({ label, choice, className, onChoose, buttonRef }: ChoiceButtonProps): React.ReactElement {
  return <button type="button" ref={buttonRef} onClick={() => onChoose(choice)} className={`${BUTTON_BASE} ${className}`}>{label}</button>;
}

function DialogActions({ onChoose, keepRef, cancelRef }: {
  onChoose: (choice: ApplyChoice) => void;
  keepRef: React.Ref<HTMLButtonElement>;
  cancelRef: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <ChoiceButton label="Keep a copy and apply" choice="keep-copy" onChoose={onChoose} buttonRef={keepRef}
        className="bg-[var(--osio-accent)] font-semibold text-[var(--osio-accent-fg)] hover:opacity-90" />
      <ChoiceButton label="Replace" choice="replace" onChoose={onChoose}
        className="bg-[var(--osio-danger)] font-medium text-[var(--osio-danger-fg)] hover:bg-[var(--osio-danger-hover)]" />
      <ChoiceButton label="Cancel" choice="cancel" onChoose={onChoose} buttonRef={cancelRef}
        className="border border-[var(--osio-border-default)] font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]" />
    </div>
  );
}

function DialogContent({ templateTitle, pageTitle, onChoose, headingId, keepRef, cancelRef }: ApplyTemplateDialogProps & {
  headingId: string;
  keepRef: React.Ref<HTMLButtonElement>;
  cancelRef: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  return (
    <div onClick={(event) => event.stopPropagation()}
      className="w-full max-w-md rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 shadow-osio-e4">
      <h2 id={headingId} className="mb-1 text-sm font-semibold text-[var(--osio-fg-default)]">Apply “{templateTitle}”?</h2>
      <p className="mb-3 text-xs text-[var(--osio-fg-muted)]">This replaces the content of “{pageTitle}”. A version is saved first.</p>
      <DialogActions onChoose={onChoose} keepRef={keepRef} cancelRef={cancelRef} />
    </div>
  );
}

export function ApplyTemplateDialog({ templateTitle, pageTitle, onChoose }: ApplyTemplateDialogProps): React.ReactElement {
  const headingId = React.useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogSetup(onChoose, keepRef);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={headingId} onClick={() => onChoose("cancel")}
      onKeyDown={(event) => trapTab(event, keepRef.current, cancelRef.current)}
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-[var(--osio-overlay)] p-6">
      <DialogContent templateTitle={templateTitle} pageTitle={pageTitle} onChoose={onChoose}
        headingId={headingId} keepRef={keepRef} cancelRef={cancelRef} />
    </div>,
    document.body,
  );
}
