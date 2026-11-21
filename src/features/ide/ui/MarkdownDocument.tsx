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

import type { ImagePolicy } from "../model/previewDocument";
import { MarkdownDocumentView } from "./MarkdownDocumentView";
import { usePreviewState } from "./usePreviewState";

interface MarkdownDocumentProps {
  source: string;
  images: ImagePolicy;
}

/** Plain Markdown, read-only, parsed in a worker: no file can stall the editor beside it. */
export const MarkdownDocument = React.memo(function MarkdownDocument({ source, images }: Readonly<MarkdownDocumentProps>) {
  return <MarkdownDocumentView state={usePreviewState(source, images)} />;
});
