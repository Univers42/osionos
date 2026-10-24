/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memberLabel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The one rule for naming a workspace member: the name the bridge sent, else
 *  the local persona's, else the id. A wire name equal to the id is the bridge
 *  echoing it back, so it does not count. */
export function memberLabel(userId: string, names: Map<string, string>, wireName?: string): string {
  const named = wireName && wireName !== userId ? wireName : names.get(userId);
  return named || userId;
}
