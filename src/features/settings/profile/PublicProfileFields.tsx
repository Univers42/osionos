/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicProfileFields.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The labelled controls of the public profile form. Every control gets its rule as
 * hint text and its error under it, both wired through `aria-describedby`.
 */

import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button, IconButton, Input } from '@/shared/ui';
import { MAX_LINKS, listTimezones } from './profileFields';

const CONTROL_CLASS = 'w-full rounded-[var(--osio-field-radius)] border border-[var(--osio-field-border)] bg-[var(--osio-field-bg)] px-2.5 py-2 text-sm text-[var(--osio-fg-default)] focus-visible:border-[var(--osio-field-border-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]';

interface FieldFrameProps {
  id: string;
  label: string;
  hint: string;
  error?: string | null;
  aside?: React.ReactNode;
  children: (aria: { id: string; 'aria-describedby': string; 'aria-invalid': boolean }) => React.ReactNode;
}

/** One label, its control, the rule as hint, and the error under it. */
export const FieldFrame: React.FC<FieldFrameProps> = ({ id, label, hint, error, aside, children }) => (
  <div className="space-y-1 py-2">
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium text-[var(--osio-fg-default)]">{label}</label>
      {aside}
    </div>
    {children({ id, 'aria-describedby': `${id}-hint${error ? ` ${id}-error` : ''}`, 'aria-invalid': Boolean(error) })}
    <p id={`${id}-hint`} className="text-xs text-[var(--osio-fg-muted)]">{hint}</p>
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-[var(--osio-danger)]">{error}</p>}
  </div>
);

interface TextFieldProps extends Omit<FieldFrameProps, 'children' | 'id'> {
  name: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  max?: number;
  /** The WCAG input purpose when the field is about the person (RGAA 11.13). */
  autoComplete?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ name, value, onChange, multiline, max, autoComplete, ...frame }) => (
  <FieldFrame
    id={`profile-${name}`}
    {...frame}
    aside={max && multiline ? <span className="text-xs text-[var(--osio-fg-muted)]">{value.length} / {max}</span> : undefined}
  >
    {(aria) => multiline
      ? <textarea {...aria} rows={5} className={`${CONTROL_CLASS} resize-y`} value={value} onChange={(event) => onChange(event.target.value)} />
      : <Input {...aria} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} />}
  </FieldFrame>
);

function timeIn(zone: string, now: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(now);
}

/** Caveat: the shown time ticks once a minute, so it can lag the real clock by up to 59 s. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(new Date()), 60_000);
    return () => globalThis.clearInterval(timer);
  }, []);
  return now;
}

const ZONES = listTimezones();

export const TimezoneField: React.FC<{ value: string; error?: string | null; onChange: (value: string) => void }> = ({ value, error, onChange }) => {
  const now = useMinuteClock();
  return (
    <FieldFrame
      id="profile-timezone"
      label="Local time"
      hint="Shown on your profile as the time where you are."
      error={error}
      aside={value && ZONES.includes(value) ? <span className="text-xs text-[var(--osio-fg-muted)]">It is {timeIn(value, now)} there</span> : undefined}
    >
      {(aria) => (
        <select {...aria} className={CONTROL_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Not shown</option>
          {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      )}
    </FieldFrame>
  );
};

export const LinksField: React.FC<{ value: string[]; error?: string | null; onChange: (value: string[]) => void }> = ({ value, error, onChange }) => (
  <FieldFrame id="profile-links" label="Links" hint={`Up to ${MAX_LINKS} links, each starting with https://.`} error={error}>
    {(aria) => (
      <div className="space-y-2">
        {value.map((link, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              {...aria}
              id={index === 0 ? aria.id : `${aria.id}-${index}`}
              aria-label={`Link ${index + 1}`}
              value={link}
              onChange={(event) => onChange(value.map((item, i) => (i === index ? event.target.value : item)))}
            />
            <IconButton label={`Remove link ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={14} /></IconButton>
          </div>
        ))}
        <Button disabled={value.length >= MAX_LINKS} onClick={() => onChange([...value, ''])}>Add link</Button>
      </div>
    )}
  </FieldFrame>
);
