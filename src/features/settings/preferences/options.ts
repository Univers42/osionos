/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   options.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { UserPreferences } from "@/store/settings";

export const NUMBER_FORMAT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "dot", label: "1,000.00" },
  { value: "comma", label: "1.000,00" },
  { value: "space", label: "1 000,00" },
] as const;

export const WEEK_START_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "relative", label: "Relative" },
  { value: "short", label: "Short" },
  { value: "iso", label: "ISO" },
] as const;

export const OPEN_ON_START_OPTIONS = [
  { value: "last-visited-page", label: "Last visited page" },
  { value: "home", label: "Home" },
  { value: "new-page", label: "New page" },
] as const;

/** Coupled write: toggling "automatic time zone" also sets or keeps the zone. */
export function setAutoTimezone(
  checked: boolean,
  preferences: UserPreferences | null | undefined,
  update: (patch: Partial<UserPreferences>) => void,
): void {
  update({
    autoTimezone: checked,
    timezone: checked ? Intl.DateTimeFormat().resolvedOptions().timeZone : preferences?.timezone,
  });
}

/** Coupled write: picking a zone turns the automatic toggle off. */
export function setTimezone(
  value: string,
  update: (patch: Partial<UserPreferences>) => void,
): void {
  update({ timezone: value, autoTimezone: false });
}
