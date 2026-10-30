/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uploadFailure.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge's 4xx refusals (a cap, a type, a size) are written for the owner;
// its 5xx text is storage internals, which the owner can only retry (#171).

import { ApiError } from '@/shared/api/client';

export const SIGN_IN_TO_UPLOAD = 'Your session has ended. Sign in again to upload.';

/** Why a photo or banner upload failed, in words the owner can act on. */
export function uploadFailureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 500) return 'The server could not store the image right now. Try again in a minute.';
  if (error instanceof Error && error.message) return error.message;
  return 'The image could not be uploaded.';
}
