/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   materialize.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { buildIdeFileTree } from "./ideFileTree";
import { collectTreeFiles } from "./idePaths";
import { ideFsWrite } from "./ideFsClient";

const MAX_MATERIALIZE_FILES = 500;

/**
 * Push the canonical page tree → real files in the sandbox volume (P4), so a
 * freshly attached sandbox starts populated and the shell/LSP see the code.
 * Each write records its echo hash (via ideFsWrite), so the fs-agent's
 * re-emission of these writes never loops back into the page store. Sequential
 * to keep the single sandbox exec unsaturated.
 * ponytail: capped at 500 files; parallelize with a small pool only if open-time
 * materialize proves slow on large workspaces.
 */
export async function materializeWorkspace(workspaceId: string, pages: PageEntry[]): Promise<number> {
  if (!workspaceId) return 0;
  const files = collectTreeFiles(buildIdeFileTree(pages)).slice(0, MAX_MATERIALIZE_FILES);
  let written = 0;
  for (const file of files) {
    if (await ideFsWrite(workspaceId, file.path, file.content)) written += 1;
  }
  return written;
}
