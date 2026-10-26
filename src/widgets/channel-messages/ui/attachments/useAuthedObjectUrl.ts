/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAuthedObjectUrl.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The chat serve route (GET /api/chat/uploads/:id) is membership-gated on the
 * Authorization bearer header — a plain `<img src>`/`<audio src>` cannot send it
 * (it would 401). So fetch the bytes once with the page-JWT and hand back a
 * `blob:` object URL (revoked on cleanup). A draft `blob:` preview URL — from
 * URL.createObjectURL on the local File before send — is passed through as-is.
 */

import { useCallback, useEffect, useState } from 'react';

import { API_BASE, getActivePageJwt } from '@/shared/api/client';

function isLocalPreview(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('data:');
}

export interface AuthedObject {
  src: string | undefined;
  /** The server refused the bytes or could not serve them; `retry` asks again. */
  failed: boolean;
  retry: () => void;
}

export function useAuthedObject(url: string | undefined): AuthedObject {
  // Local preview urls (blob:/data:) are usable as-is — derive, never set in effect.
  const local = url && isLocalPreview(url) ? url : undefined;
  const [fetched, setFetched] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!url || isLocalPreview(url)) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    const token = getActivePageJwt();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE}${url}`, { headers })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`${res.status}`))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFetched(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      setFetched(undefined);
      setFailed(false);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt]);

  return { src: local ?? fetched, failed: !local && failed, retry };
}

export function useAuthedObjectUrl(url: string | undefined): string | undefined {
  return useAuthedObject(url).src;
}
