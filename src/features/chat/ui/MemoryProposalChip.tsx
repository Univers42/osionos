/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MemoryProposalChip.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Remember this?": a memory the assistant proposed, and the user's decision.
 *
 * The body is a memory the model wrote: untrusted. It is a text node, never
 * markup and never markdown. The two buttons are the only way to decide: no
 * shortcut, no voice binding, and nothing in the conversation decides
 * anything (devil C65).
 *
 * The file holds NO JSX on purpose: the canvas suite renders it under node.
 */

import React, { useState } from "react";

import { approveMemory, rejectMemory } from "@/features/ai/api/memories";
import { memoryFailureMessage } from "@/features/ai/model/memories";
import type { MemoryDecision, MemoryProposalPart } from "../model/memoryParts";

export interface MemoryProposalChipProps {
  proposal: MemoryProposalPart;
  /** Writes the decision into the part of the message. */
  onDecided: (memoryId: string, decision: MemoryDecision) => void;
  /** Opens Settings › AI; left out when the host cannot. */
  onManage?: () => void;
}

const CHIP =
  "mt-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] p-2.5 text-xs text-[var(--osio-fg-default)]";
const BUTTON =
  "cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";

const preview = (body: string): string => body.slice(0, 40);

export const MemoryProposalChip: React.FC<MemoryProposalChipProps> = ({ proposal, onDecided, onManage }) => {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { memoryId, body, decision } = proposal;

  const decide = async (choice: MemoryDecision): Promise<void> => {
    setBusy(true);
    setFailure("");
    try {
      await (choice === "approved" ? approveMemory(memoryId) : rejectMemory(memoryId));
      onDecided(memoryId, choice);
    } catch (error) {
      setFailure(memoryFailureMessage(error));
    }
    setBusy(false);
  };

  const button = (label: string, choice: MemoryDecision): React.ReactElement =>
    React.createElement(
      "button",
      {
        type: "button",
        className: BUTTON,
        disabled: busy,
        onClick: () => void decide(choice),
        "aria-label": `${label}: ${preview(body)}`,
      },
      label,
    );

  return React.createElement(
    "div",
    { className: CHIP, "data-testid": "chat-memory-proposal", "data-decision": decision ?? "pending" },
    React.createElement("p", { className: "font-semibold" }, "Remember this?"),
    React.createElement("p", { className: "mt-1 break-words whitespace-pre-wrap" }, body),
    decision
      ? React.createElement(
          "p",
          { className: "mt-1 text-[var(--osio-fg-muted)]", "aria-live": "polite" },
          decision === "approved" ? "Remembered" : "Dismissed",
        )
      : React.createElement(
          "div",
          { className: "mt-2 flex items-center gap-2" },
          button("Approve", "approved"),
          button("Dismiss", "rejected"),
        ),
    failure ? React.createElement("p", { role: "alert", className: "mt-1 text-[var(--osio-danger)]" }, failure) : null,
    onManage
      ? React.createElement(
          "button",
          { type: "button", className: `${BUTTON} mt-1 text-[var(--osio-accent)] underline-offset-2 hover:underline`, onClick: onManage },
          "Manage in Settings",
        )
      : null,
  );
};
