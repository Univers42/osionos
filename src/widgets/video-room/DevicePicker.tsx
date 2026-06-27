/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DevicePicker.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Mic / camera device chooser for the call. enumerateDevices on open, then
 * room.switchActiveDevice() to hot-swap the active input without rejoining.
 */

import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { Room } from 'livekit-client';

export const DevicePicker: React.FC<{ room: Room | null }> = ({ room }) => {
  const [open, setOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    void navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput'));
      setCams(devices.filter((d) => d.kind === 'videoinput'));
    }).catch(() => undefined);
  }, [open]);

  const pick = (kind: MediaDeviceKind, deviceId: string) => {
    void room?.switchActiveDevice(kind, deviceId).catch(() => undefined);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Audio & video devices"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
      >
        <Settings size={18} />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 mb-2 w-60 -translate-x-1/2 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-[var(--osio-shadow-menu)]">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">Microphone</p>
          {mics.map((mic) => (
            <button key={mic.deviceId} type="button" onClick={() => pick('audioinput', mic.deviceId)} className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)]">{mic.label || 'Microphone'}</button>
          ))}
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">Camera</p>
          {cams.map((cam) => (
            <button key={cam.deviceId} type="button" onClick={() => pick('videoinput', cam.deviceId)} className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)]">{cam.label || 'Camera'}</button>
          ))}
        </div>
      )}
    </div>
  );
};
