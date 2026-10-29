/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';

import { Dropdown } from '@/shared/ui';
import { SettingRow, Section } from '@/features/settings/ui/settingsKit';
import { BlockedUsersPanel } from '@/features/settings/moderation/BlockedUsersPanel';
import { fetchModeration, saveModeration, type ModerationOutcome } from '@/features/settings/moderation/moderationApi';
import {
  DURATION_HOURS,
  MODES,
  auditMetadata,
  durationLabel,
  expiryLabel,
  modeLabel,
  type Interaction,
  type Limits,
} from '@/features/settings/moderation/moderationModel';
import { recordSettingsAction } from '@/store/settings';

const ROWS: Array<{ interaction: Interaction; title: string; description: string }> = [
  {
    interaction: 'messages',
    title: 'Who can direct message me',
    description: 'Nobody can open a direct message with you, or only the people you are connected to. People you already blocked are refused anyway. Direct messages only: a workspace channel, a workspace invite and a page comment are out of scope of this limit.',
  },
  {
    interaction: 'connections',
    title: 'Who can connect with me',
    description: 'Nobody can send you a connection request while this is on.',
  },
  {
    interaction: 'comments',
    title: 'Who can comment on my pages',
    description: "Nobody can comment on your pages, or only the people in the page's workspace. A block does not stop a comment.",
  },
];

type LimitsState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; limits: Limits; at: number };

const MUTED = 'text-sm text-[var(--osio-fg-muted)]';

function stateOf(outcome: ModerationOutcome): LimitsState {
  return outcome.kind === 'limits' ? { kind: 'ready', limits: outcome.limits, at: outcome.at } : outcome;
}

const InteractionLimits: React.FC = () => {
  const [state, setState] = useState<LimitsState>({ kind: 'loading' });
  const [hours, setHours] = useState<Record<Interaction, number>>({ messages: 24, connections: 24, comments: 24 });
  const [rowErrors, setRowErrors] = useState<Partial<Record<Interaction, string>>>({});

  useEffect(() => {
    let live = true;
    void fetchModeration().then((outcome) => { if (live) setState(stateOf(outcome)); });
    return () => { live = false; };
  }, []);

  if (state.kind === 'loading') return <p className={MUTED}>Loading…</p>;
  if (state.kind === 'unsupported') return <p className={MUTED}>This server does not serve interaction limits yet.</p>;
  if (state.kind === 'error') return <p className={MUTED}>{state.message}</p>;

  const save = async (interaction: Interaction, mode: string, durationHours: number) => {
    setRowErrors((previous) => ({ ...previous, [interaction]: undefined }));
    const outcome = await saveModeration(interaction, { mode, durationHours });
    if (outcome.kind === 'limits') {
      setHours((previous) => ({ ...previous, [interaction]: durationHours }));
      setState({ kind: 'ready', limits: outcome.limits, at: outcome.at });
      recordSettingsAction('moderation_limit_update', auditMetadata(interaction, mode));
      return;
    }
    const message = outcome.kind === 'error' ? outcome.message : 'This server does not serve interaction limits yet.';
    setRowErrors((previous) => ({ ...previous, [interaction]: message }));
  };

  return (
    <>
      {ROWS.map(({ interaction, title, description }) => {
        const limit = state.limits[interaction];
        return (
          <div key={interaction}>
            <SettingRow
              title={title}
              description={(
                <>
                  <span>{description}</span>
                  <span className="mt-1 block">{expiryLabel(limit.until, state.at)}</span>
                </>
              )}
              action={(
                <>
                  <Dropdown
                    label={`${title}: who`}
                    value={limit.mode}
                    options={MODES[interaction].map((mode) => ({ value: mode, label: modeLabel(interaction, mode) }))}
                    onChange={(mode) => { void save(interaction, mode, hours[interaction]); }}
                    align="end"
                    width="auto"
                  />
                  <Dropdown
                    label={`${title}: for how long`}
                    value={String(hours[interaction])}
                    disabled={limit.mode === 'everyone'}
                    options={DURATION_HOURS.map((value) => ({ value: String(value), label: durationLabel(value) }))}
                    onChange={(value) => { void save(interaction, limit.mode, Number(value)); }}
                    align="end"
                    width="auto"
                  />
                </>
              )}
            />
            {rowErrors[interaction] ? <p className={MUTED} role="status">{rowErrors[interaction]}</p> : null}
          </div>
        );
      })}
    </>
  );
};

export const ModerationPanel: React.FC = () => (
  <div className="flex flex-col gap-6">
    <Section title="Blocked users">
      <BlockedUsersPanel />
    </Section>
    <Section title="Interaction limits">
      <InteractionLimits />
    </Section>
  </div>
);
