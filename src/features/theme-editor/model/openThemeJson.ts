/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openThemeJson.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { themeJsonTab, type ThemeJsonTarget } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

/** Opens the theme JSON tab for `target`, or focuses it when it is already open. Monaco-free, so callers stay off the editor chunk. */
export function openThemeJson(target: ThemeJsonTarget): void {
  useWorkspaceLayout.getState().openTab(themeJsonTab(target));
}
