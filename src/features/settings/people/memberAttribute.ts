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

export type MemberAttribute = { name: string; value: string };

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
  let hasControl = false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) { hasControl = true; break; }
  }
  if (hasControl) return `${field} must not contain control characters`;
  return null;
}

// Aliases for the two surfaces, so either naming convention resolves.
export const validateAttributeName = validateName;
export const validateAttributeValue = validateValue;
export const validateMemberAttributeName = validateName;
export const validateMemberAttributeValue = validateValue;
export const validateAttribute = (name: unknown, value: unknown): { name: string | null; value: string | null } => ({
  name: validateName(name),
  value: validateValue(value),
});

export function validateMemberAttribute(name: unknown, value?: unknown): string | null {
  const nameError = validateName(name);
  if (nameError) return nameError;
  if (value !== undefined) return validateValue(value);
  return null;
}

export function isAttributeNameValid(name: unknown): boolean {
  return validateName(name) === null;
}

export function isAttributeValueValid(value: unknown): boolean {
  return validateValue(value) === null;
}

export default {
  validateName,
  validateValue,
  validateAttributeName,
  validateAttributeValue,
  validateMemberAttributeName,
  validateMemberAttributeValue,
  validateAttribute,
  validateMemberAttribute,
  isAttributeNameValid,
  isAttributeValueValid,
};
