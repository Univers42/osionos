import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { API_BASE } from "@/shared/api/client";
import { appMediaSigner, KNOWN_MEDIA_BRIDGES } from "@/shared/lib/media/appMediaSigner";
import { signableMedia } from "@/shared/lib/media/mediaSignature";
import type { MediaSigner } from "@/shared/lib/media/mediaSigner";

/**
 * osionos#233: the src a media element renders. A bridge upload gets a signed link from the app
 * signer; anything else, and every upload while signing is off, renders exactly its stored URL.
 *
 * D233-5: a src is chosen when the element mounts and changes only when its URL changes or it
 * fires `error`, so a loaded image or a playing video is never re-sourced. While a mount waits for
 * its first signature the src is undefined (no request to the bridge with a link about to change).
 */

/** The page a foreign upload renders in: the authority the bridge checks it against (D233-2). */
export const MediaPageContext = createContext<string | null>(null);
/** The signer every media element asks; tests hand in their own. */
export const MediaSignerContext = createContext<MediaSigner>(appMediaSigner);

const uploadOf = (url: string | null | undefined) => (url ? signableMedia(url, API_BASE, KNOWN_MEDIA_BRIDGES) : null);

/** The src on mount: the stored URL, a cached signed link, or undefined while it must be asked. */
export function mountedMediaSrc(url: string | null | undefined, pageId: string | null, signer: MediaSigner = appMediaSigner): string | undefined {
  const media = uploadOf(url);
  if (!media) return url ?? undefined;
  const link = signer.peek(media.path, pageId);
  if (link.kind === "signed") return `${media.origin}${link.path}`;
  return link.kind === "bare" ? (url ?? undefined) : undefined;
}

/** The src after `error`: one fresh signature (or the stored URL); null once it already retried. */
export async function retriedMediaSrc(url: string | null | undefined, pageId: string | null, signer: MediaSigner, retried: boolean): Promise<string | null> {
  const media = uploadOf(url);
  if (!media || retried) return null;
  signer.forget(media.path);
  const signed = await signer.sign(media.path, pageId);
  return signed ? `${media.origin}${signed}` : (url ?? null);
}

/** The URL to open or download now: the cached signed link, else the stored URL. */
export function currentMediaUrl(url: string, pageId: string | null, signer: MediaSigner = appMediaSigner): string {
  return mountedMediaSrc(url, pageId, signer) ?? url;
}

/** The signed URL of an upload (asking the bridge when needed), else the stored URL. */
export async function signedMediaUrl(url: string, pageId: string | null, signer: MediaSigner = appMediaSigner): Promise<string> {
  const media = uploadOf(url);
  const signed = media ? await signer.sign(media.path, pageId) : null;
  return media && signed ? `${media.origin}${signed}` : url;
}

interface MediaSrcState { url: string | null | undefined; src: string | undefined; retried: boolean }

export interface SignedMediaUrl {
  src: string | undefined;
  /** Hand to the element's onError: re-signs once, then leaves the broken state alone. */
  onError: () => void;
}

export function useSignedMediaUrl(url: string | null | undefined, pageId?: string | null, signerOverride?: MediaSigner): SignedMediaUrl {
  const contextPage = useContext(MediaPageContext);
  const contextSigner = useContext(MediaSignerContext);
  const page = pageId ?? contextPage;
  const signer = signerOverride ?? contextSigner;
  const [state, setState] = useState<MediaSrcState>(() => ({ url, src: mountedMediaSrc(url, page, signer), retried: false }));
  const current = state.url === url ? state : { url, src: mountedMediaSrc(url, page, signer), retried: false };
  if (current !== state) setState(current);
  useSignWhilePending(current, page, signer, setState);
  const onError = useCallback(() => {
    void retriedMediaSrc(url, page, signer, current.retried).then((src) => {
      if (src !== null) setState((prev) => (prev.url === url ? { url, src, retried: true } : prev));
    });
  }, [url, page, signer, current.retried]);
  return useMemo(() => ({ src: current.src, onError }), [current.src, onError]);
}

function useSignWhilePending(current: MediaSrcState, page: string | null, signer: MediaSigner, setState: (update: (prev: MediaSrcState) => MediaSrcState) => void): void {
  const { url, src } = current;
  useEffect(() => {
    if (!url || src !== undefined) return undefined;
    let live = true;
    void signedMediaUrl(url, page, signer).then((signed) => {
      if (live) setState((prev) => (prev.url === url && prev.src === undefined ? { ...prev, src: signed } : prev));
    });
    return () => {
      live = false;
    };
  }, [url, src, page, signer, setState]);
}
