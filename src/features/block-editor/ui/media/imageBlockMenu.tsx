/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   imageBlockMenu.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  Captions,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Link,
  Link2,
  Maximize2,
  MessageSquare,
  MoveRight,
  PencilLine,
  Replace,
  Settings2,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import type { BlockContextMenuSection } from "../../model/blockContextMenu.helpers";

export interface ImageMenuHandlers {
  replace: () => void;
  copyImage: () => void;
  download: () => void;
  caption: () => void;
  addLink: () => void;
  altText: () => void;
  fullScreen: () => void;
  viewOriginal: () => void;
  copyImageUrl: () => void;
  copyBlockLink: () => void;
  duplicate: () => void;
  moveTo: () => void;
  remove: () => void;
  comment: () => void;
  suggestEdits: () => void;
  askAI: () => void;
}

const SZ = 15;

/**
 * Builds the Notion-parity "More" menu for an image block in the exact
 * BlockContextMenuSection[] shape consumed by <BlockContextMenu>.
 */
export function buildImageMenuSections(h: ImageMenuHandlers): BlockContextMenuSection[] {
  return [
    {
      items: [
        { icon: <Replace size={SZ} />, label: "Replace", onClick: h.replace },
        { icon: <Copy size={SZ} />, label: "Copy image", onClick: h.copyImage },
        { icon: <Download size={SZ} />, label: "Download", onClick: h.download },
        { icon: <Captions size={SZ} />, label: "Caption", onClick: h.caption },
        { icon: <Link size={SZ} />, label: "Add link", onClick: h.addLink },
        {
          icon: <Settings2 size={SZ} />,
          label: "More options",
          onClick: () => undefined,
          subItems: [
            { icon: <Type size={SZ} />, label: "Alt text", onClick: h.altText },
            { icon: <Maximize2 size={SZ} />, label: "Full screen", onClick: h.fullScreen },
            { icon: <ExternalLink size={SZ} />, label: "View original", onClick: h.viewOriginal },
          ],
        },
      ],
    },
    {
      items: [
        { icon: <Link2 size={SZ} />, label: "Copy link to original", onClick: h.copyImageUrl },
        {
          icon: <Link size={SZ} />,
          label: "Copy link to block",
          shortcut: "Alt+⇧+L",
          onClick: h.copyBlockLink,
        },
        { icon: <CopyPlus size={SZ} />, label: "Duplicate", shortcut: "Ctrl+D", onClick: h.duplicate },
        { icon: <MoveRight size={SZ} />, label: "Move to", shortcut: "Ctrl+⇧+P", onClick: h.moveTo },
      ],
    },
    {
      items: [
        {
          icon: <Trash2 size={SZ} />,
          label: "Delete",
          shortcut: "Del",
          danger: true,
          onClick: h.remove,
        },
      ],
    },
    {
      items: [
        { icon: <MessageSquare size={SZ} />, label: "Comment", onClick: h.comment },
        { icon: <PencilLine size={SZ} />, label: "Suggest edits", onClick: h.suggestEdits },
        { icon: <Sparkles size={SZ} />, label: "Ask AI", onClick: h.askAI },
      ],
    },
  ];
}
