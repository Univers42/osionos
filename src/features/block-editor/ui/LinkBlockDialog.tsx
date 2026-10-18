/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkBlockDialog.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from "react";

import { Modal } from "@osionos/ui/primitives/Modal";
import { MiniTabs } from "@osionos/ui/primitives/MiniTabs";
import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";
import { linkInputPlaceholder, type EmbedHint, type LinkBlockKind } from "@/shared/lib/embed/embedHints";

import { LinkUrlForm } from "./LinkUrlForm";

interface LinkBlockDialogProps {
  kind: LinkBlockKind;
  hint?: EmbedHint;
  initialUrl?: string;
  /** Called with a validated absolute http(s) URL. Nothing is fetched here. */
  onSubmit: (url: string) => void;
  onClose: () => void;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** "example.com/page" is what people type; a real scheme (including `javascript:`)
 *  is left alone so `safeHttpUrl` can refuse it. */
function withScheme(value: string): string {
  return SCHEME.test(value) ? value : `https://${value}`;
}

/** The embed/bookmark link dialog: a Link tab only (these blocks have no upload). */
export const LinkBlockDialog: React.FC<LinkBlockDialogProps> = ({ kind, hint, initialUrl, onSubmit, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const title = kind === "embed" ? "Embed a link" : "Add a web bookmark";

  function submit(raw: string): string | void {
    const url = safeHttpUrl(withScheme(raw));
    if (url === "") return "Enter a full web address that starts with http:// or https://.";
    onSubmit(url);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm" initialFocusRef={inputRef as React.RefObject<HTMLElement>}>
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-[var(--osio-fg-strong)]">{title}</h2>
        <MiniTabs value="link" onChange={() => undefined} options={[{ value: "link", label: "Link" }]} />
        <LinkUrlForm
          inputRef={inputRef}
          placeholder={linkInputPlaceholder(kind, hint)}
          submitLabel={kind === "embed" ? "Embed link" : "Create bookmark"}
          initialValue={initialUrl}
          hint={hint === undefined ? "Any web page. Players such as YouTube and Spotify load when you press play." : `Paste a ${hint.label} link.`}
          onSubmit={submit}
        />
      </div>
    </Modal>
  );
};
