/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:17:07 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 20:57:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/14 00:00:00 by rstancu         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ReactNode } from "react";

import type { BlockType, LayoutMode, MediaBlockType } from "@/entities/block";
import type { KnownDatabaseViewType } from "@/widgets/database-view/model/databaseViewCatalog";

export interface SlashCommandBase {
  id: string;
  label: string;
  aliases?: string[];
  icon: ReactNode;
  description: string;
  section: string;
  calloutIcon?: string;
}

export interface SlashBlockCommand extends SlashCommandBase {
  kind: "block";
  blockType: BlockType;
  layoutMode?: LayoutMode;
}

export interface SlashTurnIntoCommand extends SlashCommandBase {
  kind: "turn-into";
  blockType: BlockType;
  placeholderText: string;
  layoutMode?: LayoutMode;
}

export interface SlashCreatePageCommand extends SlashCommandBase {
  kind: "create-page";
}

export interface SlashInlineCommand extends SlashCommandBase {
  kind: "inline";
  insertText: string;
}

export interface SlashDatabaseViewCommand extends SlashCommandBase {
  kind: "database-view";
  databaseId: string;
  viewId: string;
  viewType: KnownDatabaseViewType;
}

export interface SlashMediaPickerCommand extends SlashCommandBase {
  kind: "media-picker";
  mediaKind: MediaBlockType;
}

export type SlashCommand =
  | SlashBlockCommand
  | SlashTurnIntoCommand
  | SlashCreatePageCommand
  | SlashInlineCommand
  | SlashDatabaseViewCommand
  | SlashMediaPickerCommand;

export interface SlashCommandSection {
  id: string;
  label: string;
  items: SlashCommand[];
}
