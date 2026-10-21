/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AttachImageButton.ts                                :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The button that attaches an image to the question.
 *
 * It is shown only when the model of the composer sees images: a model that
 * cannot see them has no use for a picture.
 *
 * The button is written with `React.createElement` and not with JSX: the
 * canvas tests read it, and node strips the types of a file — it does not
 * read JSX.
 */

import React, { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { uploadPageMedia } from "@/shared/lib/media/pageMediaUpload";
import { API_BASE } from "@/shared/api/client";

interface Props {
  /** Whether the selected model can see images. */
  vision?: boolean;
  /** The attached image paths (bridge capability paths). */
  attachments: string[];
  /** Replaces the attached image list. */
  onChange: (paths: string[]) => void;
  /** Hard cap on the number of attachments. */
  max?: number;
}

export const AttachImageButton: React.FC<Props> = ({ vision, attachments, onChange, max = 4 }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!vision) return null;

  const onPick = async (file: File | null) => {
    if (!file || attachments.length >= max) return;
    setBusy(true);
    try {
      const absolute = await uploadPageMedia(file);
      const relative = API_BASE && absolute.startsWith(API_BASE) ? absolute.slice(API_BASE.length) : absolute;
      onChange([...attachments, relative]);
    } catch {
      // Upload failed: nothing is added.
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  const chip = (path: string, index: number) =>
    React.createElement(
      "span",
      { key: `${path}-${index}`, className: "relative inline-flex items-center", "data-testid": "image-chip" },
      React.createElement("img", { src: path, alt: "", className: "h-8 w-8 rounded-sm object-cover" }),
      React.createElement(
        "button",
        {
          type: "button",
          "aria-label": "Remove image",
          onClick: () => remove(index),
          className: "absolute -right-1 -top-1 rounded-full bg-[var(--osio-bg-surface)] p-0.5",
        },
        React.createElement(X, { size: 10 }),
      ),
    );

  return React.createElement(
    "span",
    { className: "inline-flex items-center gap-1", "data-testid": "attach-image-button" },
    React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Attach image",
        disabled: busy || attachments.length >= max,
        onClick: () => inputRef.current?.click(),
        className:
          "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-40",
      },
      React.createElement(ImagePlus, { size: 16 }),
      " Attach",
    ),
    React.createElement("input", {
      ref: inputRef,
      type: "file",
      accept: "image/*",
      className: "hidden",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onPick(event.target.files?.[0] ?? null),
    }),
    attachments.length > 0
      ? React.createElement(
          "span",
          { className: "flex flex-wrap gap-1", "data-testid": "image-chips" },
          ...attachments.map(chip),
        )
      : null,
  );
};

export default AttachImageButton;
