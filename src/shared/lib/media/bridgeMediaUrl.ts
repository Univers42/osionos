import { API_BASE } from '@/shared/api/client';

/**
 * The bridge answers uploaded media as a path relative to itself. Drawn as-is, the path
 * resolves against the web origin, which serves its index.html, so an <img> shows its alt
 * text (the profile banner in production, 2026-11-04). Anything else is returned unchanged.
 */
export function bridgeMediaUrl(url: string | null): string | null {
  return url?.startsWith('/api/media/') ? `${API_BASE}${url}` : url;
}

/**
 * Whether an image URL from a profile may be drawn: https, a same-origin path (never a
 * `//host` one), or the configured bridge's own media, whatever its scheme. A local or
 * test bridge answers on http, and without the last case its banner was refused.
 */
export function isSafeImageSource(url: string | null | undefined): url is string {
  if (!url) return false;
  if (/^(https:\/\/|\/(?!\/))/.test(url)) return true;
  return API_BASE !== '' && url.startsWith(`${API_BASE}/api/media/`);
}
