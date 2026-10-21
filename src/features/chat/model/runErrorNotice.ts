/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runErrorNotice.ts                                  :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The notice of a failed answer.
 *
 * A rate limit counts down: the reader sees how many seconds are left before
 * the retry is allowed, and the button appears when the wait is over. Every
 * other failure offers its retry at once.
 *
 * It is written with `React.createElement` and not with JSX: the canvas tests
 * read it, and node strips the types of a file — it does not read JSX.
 */

import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { errorWords } from "@/widgets/chat-shell/ui/errorWords";
import { noticeText, retryDeadline, runError, secondsLeft } from "./runErrors";

interface Props {
  /** The code the service sent. */
  code: string;
  /** The seconds the service asked the client to wait, when it did. */
  retryAfter?: number | null;
  /** The moment the failure happened: the start of the countdown. */
  since?: number;
  /** The clock of the notice: the tests give it one. */
  now?: number;
  /** Asks the question again. */
  onRetry?: () => void;
}

export const RunErrorNotice: React.FC<Props> = ({ code, retryAfter, since, now, onRetry }) => {
  const [tick, setTick] = useState<number>(() => now ?? Date.now());
  // The countdown starts when the answer failed, and the clock only moves.
  const started = useRef<number>(since ?? Date.now());

  useEffect(() => {
    if (retryAfter === undefined || retryAfter === null) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  const info = runError(code, retryAfter == null ? undefined : { "retry-after": String(retryAfter) });
  const deadline = retryDeadline(info.retryAfter, started.current);
  const left = secondsLeft(deadline, tick);
  const text = info.known ? noticeText(info, left) : errorWords(code);
  // A rate limit waits for its seconds; every other failure may be retried at
  // once.
  const mayRetry = info.retry && (left === null || left === 0);

  const retryButton =
    mayRetry && onRetry
      ? React.createElement(
          "button",
          {
            type: "button",
            onClick: onRetry,
            "data-testid": "run-error-retry",
            className:
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]",
          },
          React.createElement(RotateCcw, { size: 12 }),
          " Retry",
        )
      : null;

  return React.createElement(
    "span",
    { className: "inline-flex flex-wrap items-center gap-2", "data-testid": "run-error-notice" },
    React.createElement("span", { "data-testid": "run-error-text" }, text),
    retryButton,
  );
};

export default RunErrorNotice;
