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
import { X } from "lucide-react";

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

// px-2 only: every other box property comes from the osio-field recipe, so the
// two never compete for one property.
const DATE_CLASS = "osio-field w-auto px-2 text-sm";

const NO_VALUE: DropdownOption<string> = { value: "", label: "Empty" };

/** Editable value cell for a single page property (relation is handled by PageRelationField). */
export const PagePropertyValueField: React.FC<Props> = ({ property, editable, onChange }) => {
  if (property.type === "multi_select") {
    return <MultiSelectField property={property} editable={editable} onChange={onChange} />;
  }

  if (!editable) {
    return <span className="text-sm text-[var(--osio-fg-muted)]">{stringValue(property.value) || "Empty"}</span>;
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={property.label}
        checked={Boolean(property.value)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--osio-accent)]"
      />
    );
  }

  if ((property.type === "select" || property.type === "status") && property.options?.length) {
    return (
      // -ml-1.5 cancels the trigger's own inset so its text lines up with the
      // chips, the date field's border and plain-text values above and below.
      <div className="-ml-1.5 min-w-0">
        <Dropdown
          variant="inline"
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
      {chosen.length === 0 && !editable ? <span className="text-sm text-[var(--osio-fg-muted)]">Empty</span> : null}
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
