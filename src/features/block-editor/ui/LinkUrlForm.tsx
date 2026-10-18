/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkUrlForm.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";

import { Button } from "@/shared/ui";

interface LinkUrlFormProps {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  hint?: React.ReactNode;
  /** Handed to the Modal as `initialFocusRef`: the Modal moves focus itself on open and
   *  would override a focus call made here. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Resolves to an error message to show inline, or nothing when the link was taken. */
  onSubmit: (url: string) => string | void | Promise<string | void>;
}

const INPUT =
  "h-[var(--osio-control-h-md)] w-full rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)]";

/** The one "paste a link" form: embed, bookmark and media dialogs all use it, so the
 *  busy state and the inline error read the same everywhere. */
export const LinkUrlForm: React.FC<LinkUrlFormProps> = ({ placeholder, submitLabel, initialValue = "", hint, inputRef, onSubmit }) => {
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function submit(): Promise<void> {
    const value = draft.trim();
    if (value === "" || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const message = await onSubmit(value);
      if (typeof message === "string") setError(message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="url"
        ref={inputRef}
        value={draft}
        aria-invalid={error !== null}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        placeholder={placeholder}
        className={INPUT}
      />
      {hint === undefined ? null : <p className="text-xs text-[var(--osio-fg-subtle)]">{hint}</p>}
      {error === null ? null : (
        <p role="alert" className="text-sm text-[var(--osio-danger-fg)]">{error}</p>
      )}
      <Button tone="primary" disabled={draft.trim() === "" || isBusy} onClick={() => void submit()}>
        {isBusy ? "Adding…" : submitLabel}
      </Button>
    </div>
  );
};
