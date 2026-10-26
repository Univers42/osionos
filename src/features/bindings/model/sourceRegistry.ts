/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sourceRegistry.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { RecordSource } from "@/entities/block/model/bindingSources";

const registry = new Map<string, RecordSource>();

/** Register a record source. Later registrations replace earlier ones with the same id. */
export function registerRecordSource(source: RecordSource): void {
  registry.set(source.id, source);
}

/** Look up a registered record source by id (e.g. "settings:preferences"). */
export function getRecordSource(id: string): RecordSource | undefined {
  return registry.get(id);
}

/** All registered record sources, in registration order. */
export function listRecordSources(): readonly RecordSource[] {
  return [...registry.values()];
}

