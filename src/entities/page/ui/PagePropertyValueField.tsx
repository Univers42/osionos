/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PagePropertyValueField.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Paperclip, X } from "lucide-react";

import { Dropdown, type DropdownOption } from "@/shared/ui";
import type { PagePropertyEntry } from "../model/types";
import { asStringArray } from "./pageProperties.helpers";

interface Props {
  property: PagePropertyEntry;
  editable: boolean;
  onChange: (value: PagePropertyEntry["value"]) => void;
}

const INPUT_CLASS =
  "w-full bg-transparent outline-none text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)]";

// px-1.5 and the row-height token only: every other box property comes from the
// osio-field recipe, so the two never compete for one property. The recipe's own
// 32px would make this row taller than its 28px neighbours. On a phone the value
// column is 108px, which the native date text only fits at 12px with 6px padding
// (measured at 390px: 14px clipped the year to "202").
const DATE_CLASS = "osio-field w-auto min-w-0 max-w-full px-1.5 text-sm max-sm:text-xs [--osio-field-h:var(--osio-control-h-sm)]";

const NO_VALUE: DropdownOption<string> = { value: "", label: "Empty" };

/** Editable value cell for a single page property (relation is handled by PageRelationField). */
export const PagePropertyValueField: React.FC<Props> = ({ property, editable, onChange }) => {
  if (property.type === "multi_select") {
    return <MultiSelectField property={property} editable={editable} onChange={onChange} />;
  }

  if ((property.type === "person" || property.type === "files") && Array.isArray(property.value)) {
    return <ValueChips type={property.type} values={property.value} />;
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={property.label}
        checked={Boolean(property.value)}
        disabled={!editable}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--osio-accent)]"
      />
    );
  }

  // A blank value prints nothing: the row and its name stay, an "Empty" here was noise (#162).
  if (!editable) {
    return <span className="text-sm text-[var(--osio-fg-muted)]">{stringValue(property.value)}</span>;
  }

  if ((property.type === "select" || property.type === "status") && property.options?.length) {
    return (
      // The empty state is an inline trigger; -ml-1.5 cancels its inset so the
      // text lines up with the chips and the date field's border above and below.
      <div className={`min-w-0${stringValue(property.value) ? "" : " -ml-1.5"}`}>
        <Dropdown
          variant={stringValue(property.value) ? "chip" : "inline"}
          width="auto"
          label={property.label}
          placeholder="Empty"
          value={stringValue(property.value)}
          options={[NO_VALUE, ...property.options.map((option) => ({ value: option, label: option }))]}
          onChange={onChange}
        />
      </div>
    );
  }

  if ((property.type ?? "text") === "text") {
    return <TextValueField property={property} onChange={onChange} />;
  }

  return (
    <input
      aria-label={property.label}
      type={inputType(property.type)}
      value={stringValue(property.value)}
      placeholder="Empty"
      autoComplete="off"
      onChange={(event) =>
        onChange(property.type === "number"
          ? (event.target.value === "" ? null : Number(event.target.value))
          : event.target.value)
      }
      className={property.type === "date" ? DATE_CLASS : INPUT_CLASS}
    />
  );
};

/**
 * Text values can hold line breaks (Shift+Enter in a database cell), which an
 * <input> silently strips, so an edit here used to save the lines merged. Keys
 * match the table cell: Shift+Enter adds a line, Enter finishes.
 */
const TextValueField: React.FC<Omit<Props, "editable">> = ({ property, onChange }) => {
  const text = stringValue(property.value);
  return (
    <textarea
      aria-label={property.label}
      value={text}
      rows={Math.min(text.split("\n").length, 8)}
      placeholder="Empty"
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
      className={`${INPUT_CLASS} block resize-none`}
    />
  );
};

/** People (an initial) and attachments (a clip), one read-only chip each, never joined text (#162). */
const ValueChips: React.FC<{ type: "person" | "files"; values: string[] }> = ({ type, values }) => (
  <div className="flex min-w-0 flex-wrap items-center gap-1">
    {values.map((value, index) => (
      <span key={`${index}:${value}`} className="osio-chip max-w-60">
        {type === "person" ? (
          <span aria-hidden className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent)] text-3xs font-semibold text-[var(--osio-accent-fg)]">
            {value.charAt(0).toUpperCase()}
          </span>
        ) : <Paperclip aria-hidden size={12} className="shrink-0" />}
        <span className="truncate">{value}</span>
      </span>
    ))}
  </div>
);

/** Chips for the chosen values; the unchosen options come from a dropdown, and a property with no options takes free text. */
const MultiSelectField: React.FC<Props> = ({ property, editable, onChange }) => {
  const chosen = asStringArray(property.value);
  const remaining = (property.options ?? []).filter((option) => !chosen.includes(option));

  if (editable && !property.options?.length) {
    return (
      <input
        aria-label={property.label}
        value={chosen.join(", ")}
        placeholder="Comma, separated, tags"
        onChange={(event) => onChange(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
        className={INPUT_CLASS}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {chosen.map((tag) => (
        <span key={tag} className="osio-chip">
          {tag}
          {editable ? (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(chosen.filter((value) => value !== tag))}
              className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            >
              <X size={10} />
            </button>
          ) : null}
        </span>
      ))}
      {editable && remaining.length > 0 ? (
        <Dropdown
          variant="inline"
          width="auto"
          label={`Add to ${property.label}`}
          placeholder="Add"
          value=""
          options={remaining.map((option) => ({ value: option, label: option }))}
          onChange={(option) => onChange([...chosen, option])}
        />
      ) : null}
    </div>
  );
};

function inputType(type: PagePropertyEntry["type"]): React.HTMLInputTypeAttribute {
  if (type === "date") return "date";
  if (type === "url") return "url";
  if (type === "email") return "email";
  if (type === "phone") return "tel";
  if (type === "number") return "number";
  return "text";
}

function stringValue(value: PagePropertyEntry["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
}
