/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   twoStepMethods.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PreferredMfaMethod } from '@/store/settings/types';

export const METHOD_LABELS: Record<PreferredMfaMethod, string> = {
  totp: 'Authenticator app',
  recovery: 'Recovery code',
};

/**
 * The methods in the order the modal offers them: the preferred one first. It only orders
 * the list; the server never reads the preference, and a passkey is not an option.
 */
export function orderedMethods(preferred: PreferredMfaMethod | undefined): PreferredMfaMethod[] {
  return preferred === 'recovery' ? ['recovery', 'totp'] : ['totp', 'recovery'];
}
