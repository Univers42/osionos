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
  /** The markdown prefix that creates this block (`#`, `-`, `>`, …). */
  shortcut?: string;
  calloutIcon?: string;
  /** Built-in app identifier that must be ready (flag on, URL configured) for this command to exist. */
  requiresApp?: string;
}

export interface SlashBlockCommand extends SlashCommandBase {
  kind: "block";
  blockType: BlockType;
  layoutMode?: LayoutMode;
  /** Prefilled layout recipe (e.g. the "/header" profile dashboard). */
  layoutPreset?: "profile_header";
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

export interface SlashWhiteboardCommand extends SlashCommandBase {
  kind: "whiteboard";
}

/** `/profile field`: a README block bound to a field of the owner's public profile. */
export interface SlashProfileFieldCommand extends SlashCommandBase {
  kind: "profile-field";
}

/** An AI action: the service's command, run on the block the menu was opened on. */
export interface SlashAiCommand extends SlashCommandBase {
  kind: "ai";
  /** The name of the command the service knows (`ask`, `summarize`, …). */
  command: string;
}

/** The dictation: the voice of the user, written at the caret. */
export interface SlashDictateCommand extends SlashCommandBase {
  kind: "dictate";
}

/** An AI image: `/imagine <prompt>` inserts an image block the engine fills. */
export interface SlashAiImageCommand extends SlashCommandBase {
  kind: "ai-image";
}

/** `/embed`, `/bookmark` and the provider shortcuts: an empty embed or bookmark block
 *  whose link dialog opens at once, with `hintId` naming the provider it waits for. */
export interface SlashLinkBlockCommand extends SlashCommandBase {
  kind: "link-block";
  blockType: "embed" | "bookmark";
  hintId?: string;
}

export type SlashCommand =
  | SlashBlockCommand
  | SlashTurnIntoCommand
  | SlashCreatePageCommand
  | SlashInlineCommand
  | SlashDatabaseViewCommand
  | SlashMediaPickerCommand
  | SlashWhiteboardCommand
  | SlashProfileFieldCommand
  | SlashAiCommand
  | SlashDictateCommand
  | SlashAiImageCommand
  | SlashLinkBlockCommand;

export interface SlashCommandSection {
  id: string;
  label: string;
  items: SlashCommand[];
}
