/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecommendationPrivacy.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings → Privacy: the switch over the recommender's log, the switch over
 * the beacon of "For you", and the activity to download or clear (C48, C54).
 *
 * The switches are the SERVER's state, not local ones: they are read on mount
 * and saved on every change, and a save that fails puts the switch back where
 * the server has it and says why. The beacon is OFF by default: the pages the
 * user sees and opens are not collected unless they say yes.
 *
 * Clearing the activity is a two-step act, in the page: the first click turns
 * the button into the confirmation, the second one erases. The confirmation is
 * announced, so the step is heard and not only seen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Toggle, useToastStore } from '@/shared/ui';
import { clearActivity, downloadActivity, readPersonalization, writePersonalization } from '../api/personalization';
import { SettingRow } from './SettingsRows';

const NOTICE = 'Your likes, reactions, comments, shares and favorites shape the pages and people osionos suggests to you. Turn this off and nothing more is collected.';
const BEACON_TITLE = 'Use the pages I see and open to improve recommendations';
const BEACON_NOTICE = 'We keep which page was shown to you or that you opened, and when — never what you typed.';
const ACTIVITY_NOTE = 'Download everything osionos has recorded about what you do, or erase it. The erasure cannot be undone.';
const DERIVED_NOTE = 'The file includes the recommendation vectors computed from your activity.';
const CONFIRM_LABEL = 'Confirm — this cannot be undone';
const CONFIRM_MS = 5000;
const FILE_NAME = 'osionos-activity.json';

export const RecommendationPrivacy: React.FC = () => {
  const toast = useToastStore((state) => state.push);
  const [capture, setCapture] = useState(true);
  const [beacon, setBeacon] = useState(false);
  const [available, setAvailable] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The value the server confirmed: what the switch falls back to.
  const serverValue = useRef(true);
  const beaconValue = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void readPersonalization().then((result) => {
      if (!alive) return;
      if (result.ok) {
        serverValue.current = result.value.captureExplicit;
        setCapture(result.value.captureExplicit);
        beaconValue.current = result.value.beaconConsent;
        setBeacon(result.value.beaconConsent);
        setAvailable(true);
        return;
      }
      setNote(result.message);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = useCallback(async (next: boolean) => {
    setCapture(next);
    setSaving(true);
    const result = await writePersonalization({ captureExplicit: next });
    setSaving(false);
    if (!result.ok) {
      setCapture(serverValue.current);
      toast({ kind: 'error', title: 'The switch did not change', description: result.message });
      return;
    }
    serverValue.current = result.value.captureExplicit;
    setCapture(result.value.captureExplicit);
  }, [toast]);

  /** The beacon: only its own switch is written, the other one keeps its value. */
  const onBeaconChange = useCallback(async (next: boolean) => {
    setBeacon(next);
    setSaving(true);
    const result = await writePersonalization({ beaconConsent: next });
    setSaving(false);
    if (!result.ok) {
      setBeacon(beaconValue.current);
      toast({ kind: 'error', title: 'The switch did not change', description: result.message });
      return;
    }
    beaconValue.current = result.value.beaconConsent;
    setBeacon(result.value.beaconConsent);
  }, [toast]);

  const onDownload = useCallback(async () => {
    const result = await downloadActivity();
    if (!result.ok) {
      toast({ kind: 'error', title: 'Your activity was not downloaded', description: result.message });
      return;
    }
    const { events, derived } = result.value;
    // The log AND the vectors derived from it: a download that leaves out the
    // data derived from the user is not the user's data.
    const file = { exportedAt: new Date().toISOString(), events, derived };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked a tick later: a synchronous revoke right after click() can cancel
    // the download before the browser has read the Blob (Firefox).
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast({ kind: 'success', title: `Your activity was downloaded (${events.length} events).` });
  }, [toast]);

  const erase = useCallback(async () => {
    const result = await clearActivity();
    if (!result.ok) {
      toast({ kind: 'error', title: 'Your activity was not cleared', description: result.message });
      return;
    }
    toast({ kind: 'success', title: `Your activity was cleared (${result.value.erased} events).` });
  }, [toast]);

  const onClear = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    void erase();
  }, [confirming, erase]);

  return (
    <>
      <SettingRow
        title="Use my activity for suggestions"
        description={NOTICE}
        action={<Toggle checked={capture} disabled={!available || saving} onChange={(next) => void onChange(next)} label="Use my activity for suggestions" />}
      />
      <SettingRow
        title={BEACON_TITLE}
        description={BEACON_NOTICE}
        action={<Toggle checked={beacon} disabled={!available || saving} onChange={(next) => void onBeaconChange(next)} label={BEACON_TITLE} />}
      />
      <SettingRow
        title="Your activity"
        description={
          <>
            {ACTIVITY_NOTE}
            <span className="mt-1 block">{DERIVED_NOTE}</span>
          </>
        }
        action={
          <>
            <Button disabled={!available} onClick={() => void onDownload()}>Download my activity</Button>
            <Button tone={confirming ? 'danger' : 'danger-subtle'} disabled={!available} onClick={onClear}>
              {confirming ? CONFIRM_LABEL : 'Clear my activity'}
            </Button>
          </>
        }
      />
      {note && <div className="text-sm text-[var(--osio-fg-muted)]">{note}</div>}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {confirming ? 'Confirm the erasure of your activity. It cannot be undone.' : ''}
      </span>
    </>
  );
};
