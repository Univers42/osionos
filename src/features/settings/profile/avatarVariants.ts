/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   avatarVariants.ts                                  :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The three square variants of an avatar, and the caps they must fit.
 *
 * The bridge has no image library: it checks the bytes and strips their
 * metadata, but it does not resize. The browser therefore produces the three
 * sizes, and this module is the one that knows which sizes they are, what
 * format they travel in and how big each one may be.
 *
 * The caps are the bridge's caps (24 / 80 / 300 KB): a variant over its cap
 * is refused there, so it is refused here first, with a message the user can
 * read.
 */

export const AVATAR_SIZES = [64, 160, 460] as const;

export const AVATAR_CAPS: Readonly<Record<number, number>> = {
  64: 24 * 1024,
  160: 80 * 1024,
  460: 300 * 1024,
};

/** The quality ladder: the first entry that fits the cap wins. */
export const AVATAR_QUALITIES = [0.82, 0.7, 0.55, 0.4] as const;

export interface EncodedAvatar {
  type: string;
  bytes: Uint8Array;
}

/** Draws the square canvas of `size` pixels and encodes it. */
export type AvatarRenderer = (size: number, type: string, quality: number) => Promise<EncodedAvatar | null>;

/** The base64 payload of one variant — no `data:` prefix, the bridge reads the bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}

/**
 * One variant: WebP when the browser gives WebP, JPEG when it does not (a
 * browser that answers another type would be refused by the bridge), and the
 * first quality whose bytes fit the cap.
 */
async function encodeVariant(render: AvatarRenderer, size: number): Promise<string> {
  const cap = AVATAR_CAPS[size];
  let type = 'image/webp';
  for (const quality of AVATAR_QUALITIES) {
    let encoded = await render(size, type, quality);
    if (!encoded || encoded.bytes.length === 0) continue;
    if (encoded.type !== 'image/webp' && encoded.type !== 'image/jpeg') {
      type = 'image/jpeg';
      encoded = await render(size, type, quality);
      if (!encoded || encoded.bytes.length === 0) continue;
    }
    if (encoded.bytes.length <= cap) return bytesToBase64(encoded.bytes);
  }
  throw new Error('The image is too large even after downscaling.');
}

/** The three variants of one avatar, keyed by their size. */
export async function buildAvatarVariants(render: AvatarRenderer): Promise<Record<string, string>> {
  const variants: Record<string, string> = {};
  for (const size of AVATAR_SIZES) {
    variants[String(size)] = await encodeVariant(render, size);
  }
  return variants;
}
