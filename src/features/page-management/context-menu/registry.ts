/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   registry.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { MenuActionCtx, PageMenuAction } from "./types";
import { SHARED_ACTIONS } from "./actions/sharedActions";
import { FILE_ACTIONS } from "./actions/fileActions";
import { DIR_ACTIONS } from "./actions/dirActions";

/** Every registered action, in render order. Sections group within. */
export const ALL_ACTIONS: PageMenuAction[] = [
  ...SHARED_ACTIONS,
  ...FILE_ACTIONS,
  ...DIR_ACTIONS,
];

/** Actions visible for the given target (file vs folder), preserving order. */
export function actionsForTarget(ctx: MenuActionCtx): PageMenuAction[] {
  const want = ctx.isFolder ? "dir" : "file";
  return ALL_ACTIONS.filter((a) => a.scope === "both" || a.scope === want);
}
