/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkLabel.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Link text safe inside `[...]`: brackets and backslashes are escaped, so a title can
 *  neither close the link early nor swallow the escape of its last character.
 *  The inline parser unescapes the same three characters (round-trip tested). */
export function escapeLinkLabel(label: string): string {
  return label.replace(/[[\]\\]/g, "\\$&");
}
