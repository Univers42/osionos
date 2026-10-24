/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmailAddForm.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { Button, Input } from '@/shared/ui';

interface EmailAddFormProps {
  busy: boolean;
  /** Resolves true when the server accepted the address; the field then clears. */
  onAdd: (email: string) => Promise<boolean>;
}

export const EmailAddForm: React.FC<EmailAddFormProps> = ({ busy, onAdd }) => {
  const [draft, setDraft] = useState('');
  const address = draft.trim();
  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd(address).then((accepted) => { if (accepted) setDraft(''); });
      }}
    >
      <label htmlFor="account-email-add" className="block text-sm font-medium text-[var(--osio-fg-default)]">Add an email</label>
      <div className="flex gap-2">
        <Input id="account-email-add" type="email" autoComplete="email" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="name@example.com" />
        <Button type="submit" tone="primary" disabled={busy || !address}>Send code</Button>
      </div>
    </form>
  );
};
