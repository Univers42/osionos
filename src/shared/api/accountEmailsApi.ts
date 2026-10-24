/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountEmailsApi.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the secondary-email routes. The server owns every fact: a row is "verified"
 * only when the list it answers says so, and nothing here keeps a local copy of a row.
 *
 * Caveat: `sentTo` is the server's masked address; it is shown as "Code sent to", never as a
 * delivery claim, because the bridge answers 202 whether or not a mail was sent.
 */

import { call, type AccountSecurityOutcome } from './accountSecurityApi';

export interface CodeRequested {
  id: string | null;
  sentTo: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const ROUTE = '/api/account/emails';
const rowPath = (id: string, action = ''): string => `${ROUTE}/${encodeURIComponent(id)}${action}`;

const requested = (payload: Record<string, unknown>): CodeRequested => ({ id: text(payload.id) || null, sentTo: text(payload.sentTo) });

export const addEmail = (email: string): Promise<AccountSecurityOutcome<CodeRequested>> =>
  call('POST', ROUTE, { email }, requested);

export const resendEmailCode = (id: string): Promise<AccountSecurityOutcome<CodeRequested>> =>
  call('POST', rowPath(id, '/code'), {}, requested);

export const verifyEmail = (id: string, code: string): Promise<AccountSecurityOutcome<true>> =>
  call('POST', rowPath(id, '/verify'), { code }, () => true as const);

export const removeEmail = (id: string): Promise<AccountSecurityOutcome<true>> =>
  call('DELETE', rowPath(id), undefined, () => true as const);
