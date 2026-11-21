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

import type { ImagePolicy, PreviewParse } from "../model/previewDocument";
import PreviewParseWorker from "../model/previewParse.worker?worker";
import { PreviewParseQueue, type PreviewState } from "../model/previewParseQueue";

const createWorker = () => new PreviewParseWorker();
const WAITING: PreviewState = { kind: "waiting" };

// The queue is made in an effect, never in render, so every unmount (StrictMode's first
// one included) terminates what its mount started; a source is posted only when it changes.
export function usePreviewState(source: string, images: ImagePolicy, parse: PreviewParse = "markdown"): PreviewState {
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
    queue.current?.request(source, images, parse);
  }, [source, images, parse]);
  return state;
}
