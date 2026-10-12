/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceMounts.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createMountTable } from "./mountTable";
import { createPageProvider } from "./pageProvider";
import { pageStoreFacade } from "../model/pageStoreFacade";
import type { MountTable } from "./types";

/** The one scheme every workbench consumer resolves: `workspace://<workspaceId>/<path>`. */
export const WORKSPACE_SCHEME = "workspace";

/** `workspace://<ws>/<rel>` with each segment URI-encoded (vpath.buildVPath form). */
export function workspaceUri(workspaceId: string, relPath: string): string {
  const segments = relPath.split("/").filter(Boolean).map((s) => encodeURIComponent(s));
  return `${WORKSPACE_SCHEME}://${workspaceId}/${segments.join("/")}`;
}

/**
 * Mount table for one workspace. LANE I STUB: `workspace://` is the page
 * provider over today's code/folder facade. Lane C (feat/ide-mounts) binds it to
 * the sandbox provider while the sandbox is online and to the page-file
 * provider otherwise, keeping these three exports.
 */
export function getWorkspaceMounts(workspaceId: string): MountTable {
  const table = createMountTable();
  table.mount(WORKSPACE_SCHEME, workspaceId, createPageProvider(WORKSPACE_SCHEME, pageStoreFacade(workspaceId)));
  return table;
}

/** Called when `workspace://<ws>` is rebound (sandbox online ↔ degraded). Returns unsubscribe. */
export function subscribeWorkspaceMounts(workspaceId: string, onChange: () => void): () => void {
  void workspaceId;
  void onChange;
  return () => undefined;
}
