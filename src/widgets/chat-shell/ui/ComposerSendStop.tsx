/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ComposerSendStop.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ArrowUp, Square } from "lucide-react";

import { COMPOSER_SEND_CLASS } from "@/shared/ui/composer/ComposerCard";

interface Props {
  streaming?: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop?: () => void;
}

/** Send while idle; Stop while an answer streams. */
export const ComposerSendStop: React.FC<Props> = ({ streaming, canSend, onSend, onStop }) =>
  streaming ? (
    <button
      type="button"
      aria-label="Stop the answer"
      onClick={() => onStop?.()}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--osio-border-default)] px-3 py-1.5 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <Square size={12} /> Stop
    </button>
  ) : (
    <button
      type="button"
      aria-label="Send message"
      onClick={onSend}
      disabled={!canSend}
      className={`${COMPOSER_SEND_CLASS} h-8 w-8`}
    >
      <ArrowUp size={16} />
    </button>
  );
