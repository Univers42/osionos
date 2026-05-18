/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   worker-runtime.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseMarkdown } from "./block-parser";
import { incrementalParse } from "./incremental";
import { renderHtml } from "./renderer";
import { renderMarkdownSource } from "./source-renderer";
import {
  createMarkEngineWorkerError,
  decodeMarkEnginePatch,
  decodeMarkEngineSource,
  type MarkEngineWorkerRequest,
  type MarkEngineWorkerResponse,
} from "./worker-protocol";

function runMarkEngineWorkerRequest(
  request: MarkEngineWorkerRequest,
): unknown {
  switch (request.method) {
    case "parse":
      return parseMarkdown(
        decodeMarkEngineSource(request.payload.source),
        request.payload.options,
      );
    case "incrementalParse":
      return incrementalParse(
        decodeMarkEngineSource(request.payload.previousText),
        request.payload.previousResult,
        decodeMarkEnginePatch(request.payload.patch),
      );
    case "renderHtml":
      return renderHtml(request.payload.ast, request.payload.options);
    case "renderSource":
      return renderMarkdownSource(
        decodeMarkEngineSource(request.payload.source),
        request.payload.options,
      );
  }
}

export function handleMarkEngineWorkerRequest(
  request: MarkEngineWorkerRequest,
): MarkEngineWorkerResponse {
  try {
    return {
      id: request.id,
      result: runMarkEngineWorkerRequest(request),
    };
  } catch (error) {
    return {
      id: request.id,
      error: createMarkEngineWorkerError(error),
    };
  }
}