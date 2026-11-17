/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useStatusEdit.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The status half of the edit form. It saves through its own endpoint and keeps its own
 * draft and error, so a failed status save never loses the profile edit, and the reverse.
 */

import { useMemo, useState } from 'react';

import { saveOwnStatus, socialAvailable, type PersonStatus } from '@/shared/social/followApi';
import { validateStatus } from '../model/peopleSocialModel';
import { sameStatus, statusDraft, statusFormFrom, type StatusForm } from './statusChoices';

export interface StatusEdit {
  form: StatusForm;
  setForm: (next: StatusForm) => void;
  dirty: boolean;
  /** The draft cannot be saved as it is (the save's own failure does not count). */
  invalid: boolean;
  /** The reason the draft cannot be saved, or the last save's failure. */
  error: string | null;
  /** True when nothing needed saving or the save went through. */
  save: () => Promise<boolean>;
  reset: () => void;
}

export function useStatusEdit(initial: PersonStatus | null): StatusEdit {
  const [stored, setStored] = useState(initial);
  const [edits, setEdits] = useState<StatusForm | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const base = useMemo(() => statusFormFrom(stored), [stored]);
  const form = edits ?? base;
  const dirty = edits !== null && !sameStatus(edits, base);
  const check = validateStatus(statusDraft(form, stored, Date.now()), Date.now());
  const invalid = dirty && !check.ok ? check.message : null;

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!check.ok) return false;
    try {
      // A cleared status is answered with null, so only the missing server is a failure here.
      if (!socialAvailable()) throw new Error('unavailable');
      await saveOwnStatus(check.body);
      setStored(check.body);
      setEdits(null);
      setSaveError(null);
      return true;
    } catch {
      setSaveError('Your status could not be saved. Try again.');
      return false;
    }
  };

  const setForm = (next: StatusForm) => { setEdits(next); setSaveError(null); };
  const reset = () => { setEdits(null); setSaveError(null); };
  return { form, setForm, dirty, invalid: invalid !== null, error: invalid ?? saveError, save, reset };
}
