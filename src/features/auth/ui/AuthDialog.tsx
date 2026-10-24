/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AuthDialog.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Checkbox, IconButton, Input, Modal } from '@/shared/ui';
import { useUserStore } from '@/features/auth';

interface AuthDialogProps {
  onClose: () => void;
}

const MODE_BASE = 'h-[var(--osio-control-h-sm)] rounded-[var(--osio-radius-sm)] px-2 transition-colors duration-[var(--osio-dur-fast)]';
const MODE_ON = 'bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-[var(--osio-e1)]';
const MODE_OFF = 'text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]';

export const AuthDialog: React.FC<AuthDialogProps> = ({ onClose }) => {
  const loginWithCredentials = useUserStore((s) => s.loginWithCredentials);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [persistInSessions, setPersistInSessions] = useState(true);
  const [busy, setBusy] = useState(false);
  const heading = mode === 'login' ? 'Connexion' : 'Créer un compte';
  let submitLabel = 'Créer le compte';
  if (busy) {
    submitLabel = 'Validation…';
  } else if (mode === 'login') {
    submitLabel = 'Connexion';
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    await loginWithCredentials(email, password, persistInSessions, mode, name);
    setBusy(false);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={heading} size="sm">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p aria-hidden className="osio-h4 text-[var(--osio-fg-default)]">{heading}</p>
            <p className="text-xs text-[var(--osio-fg-muted)]">
              Les comptes persistés restent dans les sessions actives.
            </p>
          </div>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-subtle)] p-1 text-sm">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')} className={`${MODE_BASE} ${mode === 'login' ? MODE_ON : MODE_OFF}`}>
            Se connecter
          </button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')} className={`${MODE_BASE} ${mode === 'signup' ? MODE_ON : MODE_OFF}`}>
            Créer
          </button>
        </div>

        {mode === 'signup' && (
          <label className="mb-3 block text-xs font-medium text-[var(--osio-fg-muted)]">
            <span>Nom</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" placeholder="Nom affiché" />
          </label>
        )}

        <label className="mb-3 block text-xs font-medium text-[var(--osio-fg-muted)]">
          <span>Email</span>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1" placeholder="name@example.com" required />
        </label>

        <label className="mb-3 block text-xs font-medium text-[var(--osio-fg-muted)]">
          <span>Mot de passe</span>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1" required />
        </label>

        <Checkbox
          checked={persistInSessions}
          onChange={setPersistInSessions}
          label={<span className="text-xs text-[var(--osio-fg-muted)]">Garder cet utilisateur enregistré dans les sessions actives.</span>}
          className="mb-4"
        />

        <Button type="submit" tone="primary" disabled={busy} className="w-full">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
};
