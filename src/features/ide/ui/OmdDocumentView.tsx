/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarkdownDocument.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { omdPreviewContent } from "@/features/page-file/model/omdPreviewContent";
import { RawPreviewPane } from "@/features/raw-mode/ui/RawPreviewPane";

import type { PreviewState } from "../model/previewParseQueue";
import { PreviewNotice } from "./MarkdownDocumentView";

/** The outcome of the worker's parse: the page's blocks, or the same notice a .md preview shows. */
export function OmdDocumentView({ source, state }: Readonly<{ source: string; state: PreviewState }>) {
  const content = React.useMemo(() => omdPreviewContent(source, state), [source, state]);
  const parse = React.useCallback(() => content ?? [], [content]);
  if (content === null) return <PreviewNotice state={state} />;
  return <RawPreviewPane source={source} parse={parse} />;
}
