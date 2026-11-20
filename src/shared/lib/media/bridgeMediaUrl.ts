import { API_BASE } from '@/shared/api/client';
import { isProfileImageSource, type ImageOrigins } from './imageSource';

/**
 * The bridge answers uploaded media as a path relative to itself. Drawn as-is, the path
 * resolves against the web origin, which serves its index.html, so an <img> shows its alt
 * text (the profile banner in production, 2026-11-04). Anything else is returned unchanged.
 */
export function bridgeMediaUrl(url: string | null): string | null {
  return url?.startsWith('/api/media/') ? `${API_BASE}${url}` : url;
}

/**
 * The origins classifyImageSource judges against: the web origin the app is
 * served from, and the bridge's base from VITE_API_URL — '' when none is
 * configured, which turns the bridge-media rule off.
 */
export function currentImageOrigins(): ImageOrigins {
  return { app: globalThis.location?.origin ?? '', bridge: API_BASE };
}

/**
 * Whether an image URL from a profile may be drawn: https, a same-origin path
 * (never a `//host` or `/\host` one — a browser folds a backslash into a slash
 * and strips tabs, so both resolve off-site), or the configured bridge's own
 * media, whatever its scheme. A local or test bridge answers on http, and
 * without the last case its banner was refused.
 */
export function isSafeImageSource(url: string | null | undefined): url is string {
  return isProfileImageSource(url, currentImageOrigins());
}
