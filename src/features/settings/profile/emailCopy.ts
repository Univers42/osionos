/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emailCopy.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The words of the email manager. Outage copy depends on the status the server answered:
 * a 503 means the feature is on and down (try later), a 404/501 means this server does not
 * serve it. `classifySettingsError` stays the one place that decides "unavailable".
 */

import { EMAILS_TEMPORARILY_DOWN } from '@/shared/api/accountEmailsApi';
import type { AccountSecurityOutcome } from '@/shared/api/accountSecurityApi';
import { sudoSentence } from '../ui/sudo/sudoPromptModel';

type Failed = Extract<AccountSecurityOutcome<unknown>, { ok: false }>;

export const SUDO_FIRST = "Confirm it's you first, then press Try again.";
export const TEMPORARILY_DOWN = EMAILS_TEMPORARILY_DOWN;
export const NOT_ON_SERVER = "Email changes aren't available on this server.";
export const TAKEN = "That address can't be added to this account.";

const BY_CODE: Record<string, string> = {
  email_taken: TAKEN,
  invalid_email: 'That does not look like an email address.',
  already_primary: 'That is already your primary address.',
  too_many_pending: 'Verify or remove a pending address first.',
  primary_email: "The primary address can't be removed here.",
  email_busy: 'Verification is busy right now. Try again later.',
  email_proof_invalid: 'That code could not be confirmed. Resend it and try again.',
  email_unavailable: TEMPORARILY_DOWN,
  email_changed_signout_failed: 'Your primary address HAS changed, but other devices could not be signed out. Sign them out from your sessions list.',
  primary_busy: 'Another change of your primary address is running. Try again in a minute.',
  email_unverified: 'Verify this address first.',
};

export const TAKEN_AS_PRIMARY = "That address can't be made primary on this account.";

/** The sentence for a failed call; a refused sudo is handled by the caller, not here. */
export function emailProblem(outcome: Failed, action: 'add' | 'primary' = 'add'): string {
  if (outcome.reason === 'unavailable') return outcome.temporary ? TEMPORARILY_DOWN : NOT_ON_SERVER;
  if (outcome.reason === 'sudo_required') return SUDO_FIRST;
  if (outcome.reason === 'rate_limited') return sudoSentence(outcome);
  if (action === 'primary' && outcome.code === 'email_taken') return TAKEN_AS_PRIMARY;
  return BY_CODE[outcome.code] ?? sudoSentence(outcome);
}

export const makePrimaryQuestion = (address: string, current: string): string =>
  `You'll sign in with ${address} from now on. ${current} stays on your account as a secondary address.`;

export const madePrimaryNotice = (address: string, kept: boolean): string =>
  `${address} is now your primary address. ${kept ? '' : 'The old address was not kept. '}Other devices were signed out.`;

/** `d•••@g•••.com`: enough to recognise the address, not enough to read it aloud. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '•••';
  const domain = address.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tail = dot > 0 ? domain.slice(dot) : '';
  return `${address[0]}•••@${domain[0] ?? ''}•••${tail}`;
}
