const LEGACY_INLINE_COLOR_ALIASES: Record<string, string> = {
  gray: '#334155',
  brown: '#F59E0B',
  orange: '#F59E0B',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#0EA5E9',
  purple: '#4F46E5',
  pink: '#F43F5E',
  red: '#F43F5E',
  slate: '#334155',
  indigo: '#4F46E5',
  sky: '#0EA5E9',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  white: '#FFFFFF',
  black: '#0F172A',
};

export function normalizeHexColor(value: string | undefined | null): string | null {
  if (!value) return null;

  const normalized = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized) || /^#[0-9A-F]{8}$/.test(normalized)) {
    return normalized;
  }

  const shortMatch = /^#([0-9A-F]{3,4})$/.exec(normalized);
  if (shortMatch) {
    const [red, green, blue, alpha] = shortMatch[1].split('');
    return alpha
      ? `#${red}${red}${green}${green}${blue}${blue}${alpha}${alpha}`
      : `#${red}${red}${green}${green}${blue}${blue}`;
  }

  const rgbMatch = /^RGBA?\((.*)\)$/.exec(normalized);
  if (!rgbMatch) return null;

  const channels = rgbMatch[1].split(',').slice(0, 3);
  if (channels.length !== 3) return null;
  const rgb = channels.map((channel) => {
    const valueNumber = Number.parseInt(channel, 10);
    if (!Number.isInteger(valueNumber) || valueNumber < 0 || valueNumber > 255) return null;
    return valueNumber.toString(16).padStart(2, '0').toUpperCase();
  });
  return rgb.every((channel): channel is string => channel !== null)
    ? `#${rgb.join('')}`
    : null;
}

export function normalizeInlineColorToken(token: string) {
  const normalizedHex = normalizeHexColor(token);
  if (normalizedHex) return normalizedHex;

  const alias = token.trim().toLowerCase();
  return LEGACY_INLINE_COLOR_ALIASES[alias] ?? null;
}
