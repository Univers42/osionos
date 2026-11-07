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
import PreviewParseWorker from "../model/previewParse.worker?worker";
import { PreviewParseQueue, type PreviewState } from "../model/previewParseQueue";
import { MarkdownDocumentView } from "./MarkdownDocumentView";

const createWorker = () => new PreviewParseWorker();
const WAITING: PreviewState = { kind: "waiting" };

// The queue is made in an effect, never in render, so every unmount (StrictMode's first
// one included) terminates what its mount started; a source is posted only when it changes.
function usePreviewState(source: string, images: ImagePolicy): PreviewState {
  const [state, setState] = React.useState<PreviewState>(WAITING);
  const queue = React.useRef<PreviewParseQueue | null>(null);
  React.useEffect(() => {
    const created = new PreviewParseQueue(createWorker, setState);
    queue.current = created;
    return () => {
      created.dispose();
      queue.current = null;
    };
  }, []);
  React.useEffect(() => {
    queue.current?.request(source, images);
  }, [source, images]);
  return state;
}

interface MarkdownDocumentProps {
  source: string;
  images: ImagePolicy;
}

/** Plain Markdown, read-only, parsed in a worker: no file can stall the editor beside it. */
export const MarkdownDocument = React.memo(function MarkdownDocument({ source, images }: Readonly<MarkdownDocumentProps>) {
  return <MarkdownDocumentView state={usePreviewState(source, images)} />;
});
