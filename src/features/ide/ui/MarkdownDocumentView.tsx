/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarkdownDocumentView.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { MarkdownView } from "@osionos/markdown-engine/react";

import { PREVIEW_MAX_CHARS } from "../model/previewDocument";
import { PREVIEW_PARSE_BUDGET_MS, type PreviewState } from "../model/previewParseQueue";
import "./markdownDocument.css";

const NOTICE = {
  tooLarge: `The preview shows files up to ${PREVIEW_MAX_CHARS / (1 << 20)} MiB.`,
  tooDeep: "This file is too deeply nested to preview.",
  tooSlow: `This file takes more than ${PREVIEW_PARSE_BUDGET_MS / 1000} s to preview. The Code view still edits it.`,
  unavailable: "Preview unavailable. Reopen the preview to try again.",
} as const;

function noticeOf(state: PreviewState): keyof typeof NOTICE | null {
  if (state.kind === "ready") return state.document.ok ? null : state.document.reason;
  return state.kind === "waiting" ? null : state.kind;
}

/**
 * What the preview shows for each outcome of the worker's parse. allowHtml is pinned off
 * and no caller option reaches the engine: raw HTML in a file renders as text, never as markup.
 */
export function MarkdownDocumentView({ state }: Readonly<{ state: PreviewState }>) {
  const notice = noticeOf(state);
  if (notice !== null) return <p className="osio-md-document osio-md-document-error">{NOTICE[notice]}</p>;
  if (state.kind !== "ready" || !state.document.ok) return null;
  return <MarkdownView blocks={state.document.blocks} allowHtml={false} className="osio-md-document" />;
}
