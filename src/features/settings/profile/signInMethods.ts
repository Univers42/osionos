/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   signInMethods.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sign-in rows the Account security section may show.
 *
 * A method has a row only when the server reported it: an unreported value is absent,
 * not "false", so a user with a password is never told to add one.
 *
 * Caveat: the report comes from the account settings route; a bridge that does not
 * serve it reports nothing, so the password and passkey rows are hidden there.
 */

import type { AccountSettings } from '@/store/settings/types';

export interface SignInRow {
  id: 'password' | 'passkeys';
  label: string;
}

export function signInRows(security: AccountSettings['security']): SignInRow[] {
  const rows: SignInRow[] = [];
  if (typeof security.hasPassword === 'boolean') {
    rows.push({ id: 'password', label: security.hasPassword ? 'Update password' : 'Add password' });
  }
  if (security.passkeysEnabled === true) rows.push({ id: 'passkeys', label: 'Add passkey' });
  return rows;
}
