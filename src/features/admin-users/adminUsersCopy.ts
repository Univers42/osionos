/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   adminUsersCopy.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a failed users call says to the admin. The bridge's codes are stable, its messages are
 * not meant for people, so each known code gets its own sentence and an unknown failure gets a
 * generic one. A raw code or an exception text is never shown.
 *
 * Caveat: the 429 sentence cannot name the wait: the shared http client drops the body's
 * retryAfterSeconds, so it says "a minute", the bridge's window.
 */

const BY_CODE: Record<string, string> = {
  admin_required: "Only administrators can manage users. Your access may have changed: reload the page.",
  invalid_cursor: "The list moved while you were reading it. Reload the list to continue.",
  field_not_editable: "That detail cannot be changed here. Only the display name and the directory choice can.",
  invalid_role: "That role change is not one the platform allows.",
  self_role_change: "You cannot remove your own admin role. Ask another administrator to do it.",
  audit_unavailable: "The change was not made because it could not be recorded. Try again in a moment.",
  platform_roles_unavailable: "The platform roles are not set up on the server yet. Ask whoever runs the server.",
  rate_limited: "You are going too fast. Wait a minute, then try again.",
  invalid_display_name: "The display name must be 1 to 100 characters, without control characters.",
  user_not_found: "This user no longer exists. Reload the list.",
};

const GENERIC = "Something went wrong. Try again, and reload the page if it keeps happening.";

export function adminUsersErrorCopy(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === "string" && Object.hasOwn(BY_CODE, code)) return BY_CODE[code];
  if (status === 429) return BY_CODE.rate_limited;
  if (status === 403) return BY_CODE.admin_required;
  return GENERIC;
}
