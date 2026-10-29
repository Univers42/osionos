/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dangerModel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the user types to delete the account: the username, else the email, else the
 * word DELETE. Never empty, because an empty confirm text would be satisfied by an
 * empty input.
 */
export function deleteConfirmText(username?: string | null, email?: string | null): string {
  return username?.trim() || email?.trim() || 'DELETE';
}
