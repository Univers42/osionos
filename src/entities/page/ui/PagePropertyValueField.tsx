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

import type { PagePropertyEntry } from "../model/types";
import { asStringArray } from "./pageProperties.helpers";

interface Props {
  property: PagePropertyEntry;
  editable: boolean;
  onChange: (value: PagePropertyEntry["value"]) => void;
}

const INPUT_CLASS =
  "w-full bg-transparent outline-none text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)]";

/** Editable value cell for a single page property (relation is handled by PageRelationField). */
export const PagePropertyValueField: React.FC<Props> = ({ property, editable, onChange }) => {
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
      <select
        aria-label={property.label}
        value={stringValue(property.value)}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      >
        <option value="">—</option>
        {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (property.type === "multi_select") {
    return (
      <input
        aria-label={property.label}
        value={asStringArray(property.value).join(", ")}
        placeholder="Comma, separated, tags"
        onChange={(event) => onChange(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
        className={INPUT_CLASS}
      />
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
      className={INPUT_CLASS}
    />
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
