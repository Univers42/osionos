import { API_BASE } from '@/shared/api/client';

/**
 * The bridge answers uploaded media as a path relative to itself. Drawn as-is, the path
 * resolves against the web origin, which serves its index.html, so an <img> shows its alt
 * text (the profile banner in production, 2026-11-04). Anything else is returned unchanged.
 */
export function bridgeMediaUrl(url: string | null): string | null {
  return url?.startsWith('/api/media/') ? `${API_BASE}${url}` : url;
}
