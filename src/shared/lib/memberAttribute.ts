/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memberAttribute.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Client mirror of the bridge's member-attribute name/value checks
 *  (scripts/bridge-member-attributes.mjs `validateName` / `validateValue`).
 *
 *  Returns `null` when the value is acceptable, or the same message the bridge
 *  would answer with a 400 otherwise. The server re-validates and its message
 *  wins if the two ever drift. */

const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;

export function validateName(name: unknown, field = 'attribute name'): string | null {
  const text = name == null ? '' : String(name);
  if (!NAME_RE.test(text)) return `${field} must match ^[a-z][a-z0-9_]{0,31}$`;
  return null;
}

export function validateValue(value: unknown, field = 'value'): string | null {
  const text = value == null ? '' : String(value);
  if (text.length < 1) return `${field} is required`;
  if (text.length > 64) return `${field} is too long`;
  if (text.includes(':')) return `${field} must not contain ":"`;
  if (text.startsWith(' ') || text.endsWith(' ')) return `${field} must not have leading or trailing spaces`;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point.
  if (/[\u0000-\u001f\u007f]/.test(text)) return `${field} must not contain control characters`;
  return null;
}
