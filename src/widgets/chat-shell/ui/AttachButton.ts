/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AttachButton.ts                                      :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The button that attaches an image or a text file to the question.
 *
 * It is always shown: a text file works on every model. A model that cannot
 * see images refuses a picture here, with the sentence the run failures use.
 *
 * The button is written with `React.createElement` and not with JSX: the
 * canvas tests read it, and node strips the types of a file — it does not
 * read JSX.
 */

import React, { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";

import { uploadPageMedia } from "@/shared/lib/media/pageMediaUpload";
import { API_BASE } from "@/shared/api/client";
import { runError } from "@/features/chat/model/runErrors";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";

interface Props {
  /** Whether the selected model can see images. */
  vision?: boolean;
  /** The attachments (bridge capability paths with their display names). */
  attachments: ComposerAttachment[];
  /** Replaces the attachment list. */
  onChange: (attachments: ComposerAttachment[]) => void;
  /** Hard cap on the number of attachments. */
  max?: number;
}

/** The hard cap on the number of attachments the composer takes. */
export const MAX_ATTACHMENTS = 4;

/** The service reads 10 MB at most (vision/fetchAttachment.ts). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * What the picker offers: the three image formats the service reads and the
 * text formats it quotes. Caveat: the extension list only filters the dialog;
 * the service decides by the bytes, so a file picked with "All files" is still
 * refused there when it is not UTF-8 text.
 */
export const ATTACH_ACCEPT =
  "image/png,image/jpeg,image/webp,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.htm,.log,.ts,.tsx,.js,.jsx,.mjs,.py,.go,.rs,.c,.h,.cpp,.java,.rb,.php,.sh,.sql,.css,.scss,.toml,.ini";

export const AttachButton: React.FC<Props> = ({ vision, attachments, onChange, max = MAX_ATTACHMENTS }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onPick = async (file: File | null) => {
    if (!file || attachments.length >= max) return;
    const kind = file.type.startsWith("image/") ? "image" : "file";
    setNotice(null);
    if (kind === "image" && vision !== true) {
      setNotice(runError("model_no_vision").text);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice("That file is over 10 MB");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const absolute = await uploadPageMedia(file);
      const path = API_BASE && absolute.startsWith(API_BASE) ? absolute.slice(API_BASE.length) : absolute;
      onChange([...attachments, { path, name: file.name, kind }]);
    } catch {
      // Nothing is attached, and the reader is told: a picker that closes on
      // nothing looks like a click that did not register.
      setNotice("The file could not be uploaded. Try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  const removeButton = (label: string, index: number) =>
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": label,
        onClick: () => remove(index),
        className: "absolute -right-1 -top-1 rounded-full bg-[var(--osio-bg-surface)] p-0.5",
      },
      React.createElement(X, { size: 10 }),
    );

  const chip = (attachment: ComposerAttachment, index: number) =>
    attachment.kind === "image"
      ? React.createElement(
          "span",
          { key: `${attachment.path}-${index}`, className: "relative inline-flex items-center", "data-testid": "image-chip" },
          React.createElement("img", { src: attachment.path, alt: "", className: "h-8 w-8 rounded-sm object-cover" }),
          removeButton("Remove image", index),
        )
      : React.createElement(
          "span",
          {
            key: `${attachment.path}-${index}`,
            className:
              "relative inline-flex h-8 items-center gap-1 rounded-sm bg-[var(--osio-bg-hover)] px-1.5 text-xs text-[var(--osio-fg-default)]",
            "data-testid": "file-chip",
          },
          React.createElement(FileText, { size: 14 }),
          React.createElement(
            "span",
            { className: "overflow-hidden text-ellipsis whitespace-nowrap", style: { maxWidth: "16ch" } },
            attachment.name,
          ),
          removeButton(`Remove ${attachment.name}`, index),
        );

  return React.createElement(
    "span",
    { className: "inline-flex items-center gap-1", "data-testid": "attach-button" },
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Attach file",
        disabled: busy || attachments.length >= max,
        onClick: () => inputRef.current?.click(),
        className:
          "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-40",
      },
      React.createElement(Paperclip, { size: 16 }),
      " Attach",
    ),
    React.createElement("input", {
      ref: inputRef,
      type: "file",
      accept: ATTACH_ACCEPT,
      className: "hidden",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onPick(event.target.files?.[0] ?? null),
    }),
    notice
      ? React.createElement("span", { role: "alert", className: "text-xs text-[var(--osio-danger)]" }, notice)
      : null,
    attachments.length > 0
      ? React.createElement(
          "span",
          { className: "flex flex-wrap gap-1", "data-testid": "image-chips" },
          ...attachments.map(chip),
        )
      : null,
  );
};

export default AttachButton;
