/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menus.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { MenuContext, MenuGroup } from "./menuTypes";
import { editMenu } from "./menus/editMenu";
import { fileMenu } from "./menus/fileMenu";
import { goMenu } from "./menus/goMenu";
import { helpMenu } from "./menus/helpMenu";
import { selectionMenu } from "./menus/selectionMenu";
import { terminalMenu } from "./menus/terminalMenu";
import { viewMenu } from "./menus/viewMenu";

export type { MenuAction, MenuContext, MenuGroup, MenuItem, MenuSubmenu } from "./menuTypes";

/**
 * Build the menubar groups, in menubar order. Every row dispatches to an
 * existing store action or the command palette, so nothing here is a dead
 * button, and none depends on a preserved editor text selection.
 */
export function buildMenus(ctx: MenuContext): MenuGroup[] {
  return [fileMenu(ctx), editMenu(), selectionMenu(), viewMenu(), goMenu(), terminalMenu(), helpMenu(ctx)];
}
