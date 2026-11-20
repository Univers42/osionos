/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tplId.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Takes unknown: ids arrive from storage and server echoes, which can omit them.
export function isCatalogueId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("tpl:");
}
