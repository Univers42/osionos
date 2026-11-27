import React, { useEffect, useRef, useState } from 'react';

import { THEME_TOKENS, tokenJsonLine, type ThemeGroup, type ThemeToken } from '@/shared/config/themeTokens';
import { ThemeTokenRow } from './ThemeTokenRow';

const GROUPS: readonly { id: ThemeGroup; label: string }[] = [
  { id: 'colors', label: 'Colors' },
  { id: 'layout', label: 'Layout' },
  { id: 'fonts', label: 'Fonts' },
];
const COPIED_MS = 1200;

/** The tokens whose key or description contains the query, case-insensitive. */
function matching(query: string): ThemeToken[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...THEME_TOKENS];
  return THEME_TOKENS.filter((token) => token.key.toLowerCase().includes(needle) || token.description.toLowerCase().includes(needle));
}

/** The current value of each token on <html>, read with one getComputedStyle call. */
function readValues(tokens: readonly ThemeToken[]): Map<string, string> {
  const style = getComputedStyle(document.documentElement);
  return new Map(tokens.map((token) => [token.key, style.getPropertyValue(`--osio-${token.key}`).trim()]));
}

/**
 * Settings > Preferences reference of every key a theme JSON accepts, with its kind, meaning and
 * live value. Values are read in render for open groups only; the parent re-renders on a theme or
 * appearance change, which refreshes them.
 */
export const ThemeTokenReference: React.FC = () => {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<ReadonlySet<ThemeGroup>>(new Set());
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const filtering = query.trim() !== '';
  const found = matching(query);
  const toggle = (id: ThemeGroup, open: boolean) => {
    if (filtering) return;
    setOpened((prev) => new Set(open ? [...prev, id] : [...prev].filter((group) => group !== id)));
  };
  const copy = (token: ThemeToken, value: string) => {
    const settle = (ok: boolean) => {
      setCopied({ key: token.key, ok });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), COPIED_MS);
    };
    // A refused clipboard (no permission, insecure origin) is announced, never swallowed.
    navigator.clipboard.writeText(tokenJsonLine(token.key, value)).then(() => settle(true), () => settle(false));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--osio-fg-muted)]">
        Put colors under &quot;colors&quot;, the rest under &quot;layout&quot; or &quot;fonts&quot;.
      </p>
      <label className="block text-sm text-[var(--osio-fg-default)]">
        Filter tokens
        <input
          type="search"
          name="theme-token-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 block w-full rounded-sm border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm text-[var(--osio-fg-default)]"
        />
      </label>
      {filtering && found.length === 0 ? (
        <p className="text-sm text-[var(--osio-fg-muted)]">No token matches “{query.trim()}”.</p>
      ) : null}
      <p role="status" className="sr-only">{copied ? `${copied.ok ? 'Copied' : 'Could not copy'} ${copied.key}` : ''}</p>
      {GROUPS.map(({ id, label }) => {
        const rows = found.filter((token) => token.group === id);
        if (rows.length === 0) return null;
        const open = filtering || opened.has(id);
        const values = open ? readValues(rows) : null;
        return (
          <details key={id} open={open} onToggle={(event) => toggle(id, event.currentTarget.open)} data-token-group={id}>
            <summary className="cursor-pointer text-sm font-medium text-[var(--osio-fg-default)]">{label} ({rows.length})</summary>
            {values ? (
              <dl>
                {rows.map((token) => (
                  <ThemeTokenRow key={token.key} token={token} value={values.get(token.key) ?? ''} copied={copied?.ok === true && copied.key === token.key} onCopy={copy} />
                ))}
              </dl>
            ) : null}
          </details>
        );
      })}
    </div>
  );
};
