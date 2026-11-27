import { Check, Copy } from 'lucide-react';
import React from 'react';

import type { ThemeToken } from '@/shared/config/themeTokens';

interface Props {
  token: ThemeToken;
  value: string;
  copied: boolean;
  onCopy: (token: ThemeToken, value: string) => void;
}

/** One token: its key, kind, description and live value, with a swatch for colors and a copy button for the JSON line. */
export const ThemeTokenRow: React.FC<Props> = ({ token, value, copied, onCopy }) => {
  const shown = value === '' ? '—' : value;
  return (
    <div className="space-y-1 border-b border-[var(--osio-border-default)] py-2" data-token-key={token.key}>
      <dt className="flex flex-wrap items-center gap-2">
        <code className="break-all font-mono text-xs text-[var(--osio-fg-default)]">{token.key}</code>
        <span className="rounded-sm border border-[var(--osio-border-default)] px-1 text-xs text-[var(--osio-fg-muted)]">{token.kind}</span>
      </dt>
      <dd className="break-words text-xs text-[var(--osio-fg-muted)]">{token.description}</dd>
      <dd className="flex items-start gap-2">
        {token.kind === 'color' && value !== '' ? (
          <span aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 rounded-sm border border-[var(--osio-border-default)]" style={{ background: value }} />
        ) : null}
        <code data-token-value className="min-w-0 flex-1 break-words font-mono text-xs text-[var(--osio-fg-default)]">{shown}</code>
        <button
          type="button"
          aria-label={`Copy ${token.key}`}
          onClick={() => onCopy(token, value)}
          className="shrink-0 rounded-sm p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </dd>
    </div>
  );
};
