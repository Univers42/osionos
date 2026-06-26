/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   binding.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext, useContext } from "react";

/**
 * Render-time data binding for admin-authored profile templates. A template
 * block stores the sentinel `recordRef: "$viewedUser"`; at render the open
 * profile provides the viewed user's row here, and bound blocks resolve their
 * `fieldBind` against it. Defined in the low `entities/block` layer so the
 * read-only renderer can read it without importing upward into a widget.
 */
export interface BoundRecord {
  id: string;
  customFields?: Record<string, unknown> | null;
  [field: string]: unknown;
}

const BoundRecordContext = createContext<BoundRecord | null>(null);

/** Provider — supplied by the profile widget with the viewed user's record. */
export const BoundRecordProvider = BoundRecordContext.Provider;

/** The current viewed user's record, or null outside a binding context. */
export function useBoundRecord(): BoundRecord | null {
  return useContext(BoundRecordContext);
}

/** Resolve a `fieldBind` ("headline" | "custom:<key>") against a bound record. */
export function resolveBoundField(record: BoundRecord | null, fieldBind: string | undefined): unknown {
  if (!record || !fieldBind) return undefined;
  if (fieldBind.startsWith("custom:")) return record.customFields?.[fieldBind.slice(7)];
  return record[fieldBind];
}
