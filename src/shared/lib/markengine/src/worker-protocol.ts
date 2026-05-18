/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   worker-protocol.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { RenderHtmlOptions } from "./renderer";
import type { SourceRenderOptions } from "./source-renderer";
import type {
  DocumentNode,
  IncrementalPatch,
  ParseOptions,
  ParseResult,
} from "./types";

export type MarkEngineWorkerMethod =
  | "parse"
  | "incrementalParse"
  | "renderHtml"
  | "renderSource";

export interface MarkEngineSourcePayload {
  source?: string;
  sourceBuffer?: ArrayBuffer;
}

export interface MarkEngineWorkerPatchPayload {
  fromLine: number;
  toLine: number;
  text?: string;
  textBuffer?: ArrayBuffer;
}

export type MarkEngineWorkerRequest =
  | {
      id: number;
      method: "parse";
      payload: {
        source: MarkEngineSourcePayload;
        options?: ParseOptions;
      };
    }
  | {
      id: number;
      method: "incrementalParse";
      payload: {
        previousText: MarkEngineSourcePayload;
        previousResult: ParseResult;
        patch: MarkEngineWorkerPatchPayload;
      };
    }
  | {
      id: number;
      method: "renderHtml";
      payload: {
        ast: DocumentNode;
        options?: RenderHtmlOptions;
      };
    }
  | {
      id: number;
      method: "renderSource";
      payload: {
        source: MarkEngineSourcePayload;
        options?: SourceRenderOptions;
      };
    };

export interface MarkEngineWorkerErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

export type MarkEngineWorkerResponse =
  | {
      id: number;
      result: unknown;
    }
  | {
      id: number;
      error: MarkEngineWorkerErrorPayload;
    };

interface TextEncoderLike {
  encode(source: string): Uint8Array;
}

interface TextDecoderLike {
  decode(source: Uint8Array): string;
}

function createTextEncoder(): TextEncoderLike {
  const Encoder = (globalThis as { TextEncoder?: new () => TextEncoderLike })
    .TextEncoder;
  if (!Encoder) {
    throw new Error("TextEncoder is required for MarkEngine worker transfer");
  }
  return new Encoder();
}

function createTextDecoder(): TextDecoderLike {
  const Decoder = (globalThis as { TextDecoder?: new () => TextDecoderLike })
    .TextDecoder;
  if (!Decoder) {
    throw new Error("TextDecoder is required for MarkEngine worker transfer");
  }
  return new Decoder();
}

export function encodeMarkEngineSource(source: string): {
  payload: MarkEngineSourcePayload;
  transferList: ArrayBuffer[];
  byteLength: number;
} {
  const encoded = createTextEncoder().encode(source);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);

  return {
    payload: { sourceBuffer: buffer },
    transferList: [buffer],
    byteLength: encoded.byteLength,
  };
}

export function measureMarkEngineSourceBytes(source: string): number {
  return createTextEncoder().encode(source).byteLength;
}

export function decodeMarkEngineSource(
  payload: MarkEngineSourcePayload,
): string {
  if (payload.source !== undefined) return payload.source;
  if (payload.sourceBuffer) {
    return createTextDecoder().decode(new Uint8Array(payload.sourceBuffer));
  }
  return "";
}

export function encodeMarkEnginePatch(
  patch: IncrementalPatch,
): {
  payload: MarkEngineWorkerPatchPayload;
  transferList: ArrayBuffer[];
} {
  const encodedText = encodeMarkEngineSource(patch.text);
  return {
    payload: {
      fromLine: patch.fromLine,
      toLine: patch.toLine,
      textBuffer: encodedText.payload.sourceBuffer,
    },
    transferList: encodedText.transferList,
  };
}

export function decodeMarkEnginePatch(
  patch: MarkEngineWorkerPatchPayload,
): IncrementalPatch {
  return {
    fromLine: patch.fromLine,
    toLine: patch.toLine,
    text: decodeMarkEngineSource({
      source: patch.text,
      sourceBuffer: patch.textBuffer,
    }),
  };
}

export function createMarkEngineWorkerError(
  error: unknown,
): MarkEngineWorkerErrorPayload {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
    };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return {
      name: "Error",
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: "Unknown MarkEngine worker error",
  };
}

export function reviveMarkEngineWorkerError(
  error: MarkEngineWorkerErrorPayload,
): Error {
  const revived = new Error(error.message);
  revived.name = error.name;
  revived.stack = error.stack;
  return revived;
}