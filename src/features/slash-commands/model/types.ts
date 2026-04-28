/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:17:07 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 21:26:12 by dlesieur         ###   ########.fr       */
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

import type { BlockType, MediaBlockType } from "@/entities/block";

export interface SlashCommandBase {
  id: string;
  label: string;
  icon: ReactNode;
  description: string;
  section: string;
  calloutIcon?: string;
}

export interface SlashBlockCommand extends SlashCommandBase {
  kind: "block";
  blockType: BlockType;
}

export interface SlashTurnIntoCommand extends SlashCommandBase {
  kind: "turn-into";
  blockType: BlockType;
  placeholderText: string;
}

export interface SlashCreatePageCommand extends SlashCommandBase {
  kind: "create-page";
}

export interface SlashInlineCommand extends SlashCommandBase {
  kind: "inline";
  insertText: string;
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
  | SlashMediaPickerCommand;

export interface SlashCommandSection {
  id: string;
  label: string;
  items: SlashCommand[];
}
