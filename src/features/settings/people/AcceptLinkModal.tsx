/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AcceptLinkModal.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The one-time invite link dialog, shared by the panel's email invite and the peek's
 *  contact invite. Its own module so PeoplePeek does not import PeopleDatabasePanel,
 *  which imports PeoplePeek. */

import React, { useState } from "react";
import { Button, Modal } from "@/shared/ui";

/** The People modals' text field / select spec. */
export const PEOPLE_INPUT_CLASS =
  "h-9 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

/** Shown once after an invite: no mail is sent, so the inviter passes the link on. */
export const AcceptLinkModal: React.FC<{ link: string; onClose: () => void }> = ({ link, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Invite link">
      <div className="space-y-3 p-6">
        <p className="text-sm">Send this link to the person you invited. It is shown once and works for 7 days.</p>
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} className={PEOPLE_INPUT_CLASS} aria-label="Invite link" />
        <div className="flex justify-end gap-2">
          <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
          <Button tone="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
};
