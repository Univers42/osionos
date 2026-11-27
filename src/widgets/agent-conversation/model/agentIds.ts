/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentIds.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/** The current instant as an ISO string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** A unique id carrying a readable `prefix`. */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
