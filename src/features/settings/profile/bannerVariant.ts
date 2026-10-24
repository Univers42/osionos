/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bannerVariant.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profile banner in the browser: the largest centred 3:1 rectangle of the
 * source, drawn at 1500x500 and encoded under the bridge's 400 KB cap. The
 * bridge does not resize, it refuses any other size.
 *
 * Caveat: the centre crop cannot be moved, so a tall source loses its top and
 * bottom; the bridge's cap is checked here first so the user reads the reason.
 */

import { AVATAR_QUALITIES, bytesToBase64, type AvatarRenderer } from './avatarVariants';

export const BANNER_WIDTH = 1500;
export const BANNER_HEIGHT = 500;
export const BANNER_CAP = 400 * 1024;

export interface CropRect { x: number; y: number; width: number; height: number }

/** The largest centred 3:1 rectangle inside a width x height source. */
export function bannerCropRect(width: number, height: number): CropRect {
  const cropWidth = Math.min(width, height * 3);
  const cropHeight = cropWidth / 3;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

/** The base64 banner: WebP when the browser gives WebP, JPEG otherwise, at the first quality that fits. */
export async function buildBannerPayload(render: AvatarRenderer): Promise<string> {
  let type = 'image/webp';
  for (const quality of AVATAR_QUALITIES) {
    let encoded = await render(BANNER_WIDTH, type, quality);
    if (encoded && encoded.type !== 'image/webp' && encoded.type !== 'image/jpeg') {
      type = 'image/jpeg';
      encoded = await render(BANNER_WIDTH, type, quality);
    }
    if (encoded && encoded.bytes.length > 0 && encoded.bytes.length <= BANNER_CAP) return bytesToBase64(encoded.bytes);
  }
  throw new Error('The image is too large even after downscaling.');
}
