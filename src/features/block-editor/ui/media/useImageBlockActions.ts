/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useImageBlockActions.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { API_BASE } from "@/shared/api/client";
import { mediaPathOfAsset, useAssistantHandoff } from "@/features/chat/model/assistantHandoff";
import { chatTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { duplicateBlockInTree } from "../../model/blockContextMenu.helpers";

export interface ImageBlockActions {
  download: () => void;
  copyImageUrl: () => void;
  copyBlockLink: () => void;
  copyImage: () => void;
  duplicate: () => void;
  remove: () => void;
  comment: () => void;
  moveTo: () => void;
  addLink: () => void;
  viewOriginal: () => void;
  suggestEdits: () => void;
  askAI: () => void;
}

/**
 * Real, capability-backed actions for an image block's toolbar/menu.
 * Ones with no backend (moveTo/addLink/suggestEdits) surface an
 * honest "coming soon" toast rather than a silent no-op.
 */
export function useImageBlockActions(
  pageId: string,
  blockId: string,
  url: string | undefined,
  altText: string,
  asset: string | undefined,
): ImageBlockActions {
  const deleteBlock = usePageStore((s) => s.deleteBlock);
  const updatePageContent = usePageStore((s) => s.updatePageContent);
  const pageById = usePageStore((s) => s.pageById);
  const pushToast = useToastStore((s) => s.push);

  const download = useCallback(() => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = altText || "image";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [altText, url]);

  const copyText = useCallback(
    (text: string, title: string) => {
      navigator.clipboard
        ?.writeText(text)
        .then(() => pushToast({ kind: "success", title }))
        .catch(() => pushToast({ kind: "error", title: "Couldn't copy" }));
    },
    [pushToast],
  );

  const copyImageUrl = useCallback(() => {
    if (url) copyText(url, "Link copied");
  }, [copyText, url]);

  const copyBlockLink = useCallback(() => {
    const link = `${globalThis.location.origin}${globalThis.location.pathname}#block-${blockId}`;
    copyText(link, "Block link copied");
  }, [blockId, copyText]);

  const copyImage = useCallback(() => {
    if (!url) return;
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      copyImageUrl();
      return;
    }
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]))
      .then(() => pushToast({ kind: "success", title: "Image copied" }))
      .catch(() => copyImageUrl());
  }, [copyImageUrl, pushToast, url]);

  const duplicate = useCallback(() => {
    const page = pageById(pageId);
    if (!page) return;
    updatePageContent(pageId, duplicateBlockInTree(page.content ?? [], blockId).blocks);
  }, [blockId, pageById, pageId, updatePageContent]);

  const remove = useCallback(() => deleteBlock(pageId, blockId), [blockId, deleteBlock, pageId]);

  const comment = useCallback(() => {
    globalThis.dispatchEvent(
      new CustomEvent("osionos:add-page-comment", { detail: { pageId, blockId } }),
    );
  }, [blockId, pageId]);

  const viewOriginal = useCallback(() => {
    if (url) globalThis.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const comingSoon = useCallback(
    (title: string) => pushToast({ kind: "info", title, description: "Coming soon." }),
    [pushToast],
  );

  const moveTo = useCallback(() => comingSoon("Move to"), [comingSoon]);
  const addLink = useCallback(() => comingSoon("Add link"), [comingSoon]);
  const suggestEdits = useCallback(() => comingSoon("Suggest edits"), [comingSoon]);

  /**
   * Hands the image over to the Assistant.
   *
   * The picture becomes an attachment of the question — the user still types
   * and presses Send, and the image goes with it then (devil C79).
   *
   * An image the service will not read — a gallery picture, an external link,
   * a picture of another host — is never sent: the reader is told why (devil
   * C80: the service never receives a URL).
   */
  const askAI = useCallback(() => {
    const path = mediaPathOfAsset(asset, API_BASE);
    if (!path) {
      pushToast({
        kind: "info",
        title: "Ask AI",
        description:
          "Ask AI reads images uploaded to this workspace. This image is a link: upload it to ask about it.",
      });
      return;
    }
    useAssistantHandoff.getState().handOff({ attachments: [path], text: "" });
    useWorkspaceLayout.getState().openTab(chatTab());
  }, [asset, pushToast]);

  return {
    download,
    copyImageUrl,
    copyBlockLink,
    copyImage,
    duplicate,
    remove,
    comment,
    moveTo,
    addLink,
    viewOriginal,
    suggestEdits,
    askAI,
  };
}
