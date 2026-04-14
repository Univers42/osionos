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

export interface SlashMediaPickerCommand extends SlashCommandBase {
  kind: "media-picker";
  mediaKind: MediaBlockType;
}

export type SlashCommand = SlashBlockCommand | SlashMediaPickerCommand;

export interface SlashCommandSection {
  id: string;
  label: string;
  items: SlashCommand[];
}
