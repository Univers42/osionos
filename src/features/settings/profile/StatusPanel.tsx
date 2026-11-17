/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   StatusPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';

import { Button } from '@/shared/ui';
import { fetchPersonCard, type PersonStatus } from '@/shared/social/followApi';
import { SettingRow } from '../ui/settingsKit';
import { StatusFields } from './StatusFields';
import { statusFormFrom } from './statusChoices';
import { useStatusEdit } from './useStatusEdit';

const Editor: React.FC<{ initial: PersonStatus | null }> = ({ initial }) => {
  const edit = useStatusEdit(initial);
  const [saved, setSaved] = useState(false);
  const submit = async () => { setSaved(false); setSaved(await edit.save()); };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-2">
      <StatusFields form={edit.form} error={edit.error} onChange={edit.setForm} />
      <div className="flex items-center gap-2">
        <Button type="submit" tone="primary" disabled={!edit.dirty || edit.invalid}>Save status</Button>
        <Button onClick={() => edit.setForm(statusFormFrom(null))}>Clear</Button>
        {saved && <span role="status" className="text-xs text-[var(--osio-fg-muted)]">Status saved.</span>}
      </div>
    </form>
  );
};

/** Settings > Social hosts the profile page's status fields behind their own Save: the status has its own endpoint. */
export const StatusPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const [initial, setInitial] = useState<{ status: PersonStatus | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetchPersonCard(userId).then((card) => { if (live) setInitial({ status: card?.status ?? null }); })
      .catch(() => { if (live) setInitial({ status: null }); });
    return () => { live = false; };
  }, [userId]);
  return (
    <SettingRow stack title="Status" description="Shown on your card. It disappears by itself at the time you choose."
      action={initial ? <Editor initial={initial.status} /> : <span className="text-xs text-[var(--osio-fg-muted)]">Loading</span>} />
  );
};
