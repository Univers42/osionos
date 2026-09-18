/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   errors.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The ONE error taxonomy every filesystem provider maps its native errors
 *  into (ADR-001 §4). Consumers never see errno, HTTP status, or docker text. */
export type FsErrorCode =
  | "NotFound"
  | "PermissionDenied"
  | "NotADirectory"
  | "IsADirectory"
  | "NotEmpty"
  | "AlreadyExists"
  | "Loop"
  | "NoSpace"
  | "ReadOnly"
  | "TooLarge"
  | "Interrupted"
  | "Unsupported"
  | "Io";

/** A filesystem error: a taxonomy code + the URI it concerns + optional detail. */
export class FsError extends Error {
  readonly code: FsErrorCode;
  readonly uri: string | undefined;

  constructor(code: FsErrorCode, uri?: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "FsError";
    this.code = code;
    this.uri = uri;
  }
}

/** Shorthand constructor — providers throw `fsError("NotFound", path.uri)`. */
export function fsError(code: FsErrorCode, uri?: string, detail?: string): FsError {
  return new FsError(code, uri, detail);
}

/** Type guard for catch blocks. */
export function isFsError(value: unknown): value is FsError {
  return value instanceof FsError;
}
