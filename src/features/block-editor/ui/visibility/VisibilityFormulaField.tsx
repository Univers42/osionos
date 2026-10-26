/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VisibilityFormulaField.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { initFormulaEngine, isWasmReady, validateFormula } from "@/shared/notion-database-sys/src/lib/engine/bridge";

export interface VisibilityFormulaFieldProps {
  /** The committed formula (undefined/empty means always visible). */
  value: string | undefined;
  /** Called with the trimmed draft on blur or Enter. Empty string clears. */
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  name?: string;
}

/**
 * Input + Check button + status line for a visibility formula. Extracted so the
 * canvas inspector and the block "Show when…" popover share one implementation.
 */
export function VisibilityFormulaField({
  value,
  onCommit,
  placeholder = 'prop("status") == "active"',
  ariaLabel = "Visibility formula",
  name = "visibility-formula",
}: VisibilityFormulaFieldProps): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = draft ?? value ?? "";

  const commit = () => {
    const pending = draft;
    setDraft(null);
    if (pending !== null) onCommit(pending.trim());
  };

  const runCheck = async (source: string) => {
    const trimmed = source.trim();
    if (trimmed === "") {
      setCheck(null);
      return;
    }
    if (!isWasmReady()) {
      await initFormulaEngine();
    }
    const result = validateFormula(trimmed);
    setCheck(
      result.ok
        ? { ok: true, message: "Formula is valid." }
        : { ok: false, message: result.errors[0]?.message ?? "This formula is not valid." },
    );
  };

  return (
    <>
      <input
        ref={inputRef}
        className="osio-field w-full px-2 text-sm"
        value={current}
        onFocus={() => setDraft(value ?? "")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        name={name}
        autoComplete="off"
      />
      <div className="osionos-layout-segmented">
        <button
          type="button"
          title="Check the formula and show the first error"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCheck(inputRef.current?.value ?? value ?? "")}
        >
          Check
        </button>
      </div>
      {check ? (
        <p role="status" className={check.ok ? "text-xs text-[var(--osio-success)]" : "text-xs text-[var(--osio-danger)]"}>
          {check.message}
        </p>
      ) : null}
    </>
  );
}