/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileFields.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * Field validators for the public profile editor. They mirror the P1-1 column
 * constraints so a person sees the error before the request goes out.
 *
 * Caveat: client-side only. The server re-validates and its 422 names the field
 * it refused; a rule that drifts from P1-1 shows up there, never as a silent save.
 */

import type { AccountProfile, AccountProfilePatch } from '@/shared/api/accountProfileApi';

export const MAX_LINKS = 4;

export type ProfileForm = Record<
  'displayName' | 'pronouns' | 'headline' | 'bio' | 'location' | 'company' | 'website' | 'timezone' | 'orcid' | 'patreon',
  string
> & { links: string[] };

const NO_NEWLINE = /[\r\n]/;
const HTTP_URL = /^https?:\/\/\S+$/i;
const HTTPS_URL = /^https:\/\/\S+$/i;
const PATREON = /^[A-Za-z0-9_-]{1,64}$/;
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

function maxLength(label: string, limit: number, value: string): string | null {
  return value.length > limit ? `${label} must be ${limit} characters or fewer.` : null;
}

export function validateDisplayName(value: string): string | null {
  if (!value.trim()) return 'Display name is required.';
  if (NO_NEWLINE.test(value)) return 'Display name must be a single line.';
  return maxLength('Display name', 100, value);
}

export const validatePronouns = (value: string) => maxLength('Pronouns', 40, value);
export const validateHeadline = (value: string) => maxLength('Headline', 200, value);
export const validateBio = (value: string) => maxLength('Bio', 2000, value);
export const validateLocation = (value: string) => maxLength('Location', 120, value);
export const validateCompany = (value: string) => maxLength('Company', 100, value);

export function validateWebsite(value: string): string | null {
  if (!value) return null;
  return HTTP_URL.test(value) ? null : 'Website must start with http:// or https://.';
}

export function validateLinks(value: string[]): string | null {
  if (value.length > MAX_LINKS) return `You can add up to ${MAX_LINKS} links.`;
  return value.every((link) => HTTPS_URL.test(link)) ? null : 'Every link must start with https://.';
}

/**
 * Caveat: `Intl.supportedValuesOf` is the browser's list, which can lag the
 * server's tz database by a release; UTC is added because engines omit it.
 */
export function listTimezones(): string[] {
  return ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
}

export function validateTimezone(value: string): string | null {
  if (!value) return null;
  return listTimezones().includes(value) ? null : 'Timezone is not recognised.';
}

export function validatePatreon(value: string): string | null {
  if (!value) return null;
  return PATREON.test(value) ? null : 'Patreon handle must be 1-64 letters, numbers, hyphens or underscores.';
}

/** ISO 7064 MOD 11-2 over the first 15 digits; 10 is written X. */
function orcidChecksumOk(orcid: string): boolean {
  const digits = orcid.replaceAll('-', '');
  let total = 0;
  for (const digit of digits.slice(0, 15)) total = (total + Number(digit)) * 2;
  const check = (12 - (total % 11)) % 11;
  return digits[15] === (check === 10 ? 'X' : String(check));
}

export function validateOrcid(value: string): string | null {
  if (!value) return null;
  if (!ORCID.test(value)) return 'ORCID must look like 0000-0002-1825-0097.';
  return orcidChecksumOk(value) ? null : 'ORCID check digit is not valid.';
}

const VALIDATORS: Record<keyof ProfileForm, (value: never) => string | null> = {
  displayName: validateDisplayName, pronouns: validatePronouns, headline: validateHeadline,
  bio: validateBio, location: validateLocation, company: validateCompany, website: validateWebsite,
  links: validateLinks, timezone: validateTimezone, orcid: validateOrcid, patreon: validatePatreon,
};

export function validateField<K extends keyof ProfileForm>(name: K, value: ProfileForm[K]): string | null {
  return (VALIDATORS[name] as (value: ProfileForm[K]) => string | null)(value);
}

export function formFromProfile(profile: AccountProfile): ProfileForm {
  return {
    displayName: profile.displayName ?? '', pronouns: profile.pronouns ?? '',
    headline: profile.headline ?? '', bio: profile.bio ?? '', location: profile.location ?? '',
    company: profile.company ?? '', website: profile.website ?? '', links: profile.links ?? [],
    timezone: profile.timezone ?? '', orcid: profile.orcid ?? '', patreon: profile.patreon ?? '',
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => item === b[i]);
  return a === b;
}

/** Only the keys whose value differs, so a save never rewrites a column it did not touch. */
export function diffProfile<T extends Record<string, unknown>>(base: T, draft: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(draft) as Array<keyof T>) {
    if (!sameValue(base[key], draft[key])) changed[key] = draft[key];
  }
  return changed;
}

/** An empty field is sent as null: the columns hold NULL, not an empty string. */
export function toPatch(changed: Partial<ProfileForm>): AccountProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changed)) patch[key] = value === '' ? null : value;
  return patch as AccountProfilePatch;
}
