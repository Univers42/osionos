/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ViewAsTester.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { Dropdown } from '@/shared/ui';
import { decide, type DecideResponse, type SharePerson } from '@/features/share';

interface ViewAsTesterProps {
  people: SharePerson[];
  resources: string[];
}

const ACTIONS = ['list', 'create', 'update', 'delete'] as const;

/** "View as" tester: pick a roster person + resource + action, ask the live
 *  /permissions/decide endpoint, render allow/deny + the field mask. */
export const ViewAsTester: React.FC<ViewAsTesterProps> = ({ people, resources }) => {
  const [personId, setPersonId] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState<string>('list');
  const [result, setResult] = useState<DecideResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!personId || !resource) { setError('Pick a person and a resource first.'); return; }
    setPending(true);
    setError(null);
    try {
      setResult(await decide({ user: { id: personId }, resource_type: 'table', resource_name: resource, op: action }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision call failed.');
      setResult(null);
    } finally {
      setPending(false);
    }
  }

  const tableResources = resources.filter((name) => name !== '*');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          value={personId || 'Pick a person'}
          options={people.map((person) => ({ value: person.id, label: `${person.name} (${person.role})` }))}
          onChange={setPersonId}
          align="start"
          width="auto"
        />
        <Dropdown
          value={resource || 'Pick a resource'}
          options={tableResources.map((name) => ({ value: name, label: name }))}
          onChange={setResource}
          align="start"
          width="auto"
        />
        <Dropdown
          value={action}
          options={ACTIONS.map((value) => ({ value, label: value }))}
          onChange={setAction}
          align="start"
          width="auto"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => { void run(); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] transition-colors duration-[120ms] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Eye size={14} /> {pending ? 'Asking…' : 'Test access'}
        </button>
      </div>
      {error && <p className="text-xs text-[var(--osio-danger)]">{error}</p>}
      {result && (
        <div className={`rounded-md border px-3 py-2 text-sm ${result.allow ? 'border-[var(--osio-success)]/40 bg-[var(--osio-success)]/5' : 'border-[var(--osio-danger)]/40 bg-[var(--osio-danger)]/5'}`}>
          <div className={`font-medium ${result.allow ? 'text-[var(--osio-success)]' : 'text-[var(--osio-danger)]'}`}>
            {result.allow ? 'ALLOW' : 'DENY'} <span className="font-normal text-[var(--osio-fg-muted)]">— {result.reason} ({result.mode})</span>
          </div>
          {result.mask && (
            <code className="mt-1 block text-[11px] text-[var(--osio-fg-muted)]">
              mask: {JSON.stringify(result.mask)}
            </code>
          )}
        </div>
      )}
    </div>
  );
};
