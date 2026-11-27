import { THEME_LIMITS, themeSlug } from '../../../../scripts/bridge-theme-rules.mjs';
import { SHIPPED_THEMES } from '../../../shared/config/themes';

/**
 * A name for a new theme: `base` trimmed when its slug is free (not taken, not shipped),
 * else `<base> 2`, `<base> 3` ... The stem is cut so the result never exceeds the name limit;
 * a slug keeps only its first `slugMax` characters, so a long stem is cut again to leave the
 * suffix inside the slug, which is what makes the candidates differ.
 */
export function uniqueThemeName(base: string, taken: Iterable<string>): string {
  const used = new Set<string>([...taken, ...SHIPPED_THEMES.map((theme) => theme.name)].map(themeSlug));
  const stem = base.trim().slice(0, THEME_LIMITS.nameMax).trim();
  if (!used.has(themeSlug(stem))) return stem;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    for (const room of [THEME_LIMITS.nameMax, THEME_LIMITS.slugMax]) {
      const candidate = `${stem.slice(0, room - suffix.length).trimEnd()}${suffix}`;
      if (!used.has(themeSlug(candidate))) return candidate;
    }
  }
}
