/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mountTable.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "./errors";
import { parseVPath } from "./vpath";
import type { FsProvider, MountTable } from "./types";

export type MutableMountTable = MountTable & {
  mount(scheme: string, authority: string, provider: FsProvider): void;
  unmount(scheme: string, authority: string): void;
};

/** URI → provider routing (ADR-001 §2). A backend is a leaf: mounting one is
 *  the ONLY integration step; consumers resolve through here and never name a
 *  provider directly. */
export function createMountTable(): MutableMountTable {
  const table = new Map<string, { scheme: string; authority: string; provider: FsProvider }>();
  const keyOf = (scheme: string, authority: string): string => `${scheme.toLowerCase()}://${authority}`;

  return {
    mount(scheme, authority, provider) {
      table.set(keyOf(scheme, authority), { scheme: scheme.toLowerCase(), authority, provider });
    },
    unmount(scheme, authority) {
      table.delete(keyOf(scheme, authority));
    },
    resolve(uri) {
      const path = parseVPath(uri);
      const entry = table.get(keyOf(path.scheme, path.authority));
      if (!entry) throw fsError("Unsupported", uri, "no mount for this scheme://authority");
      return { provider: entry.provider, path };
    },
    mounts() {
      return [...table.values()];
    },
  };
}
