/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUnreadSync.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Seed + refresh per-channel unread counts from the bridge into useUnreadStore:
 * once on mount, then every 60s and on window focus. Mount it ONCE near a stable
 * sidebar root. Best-effort — a missing bridge/session just leaves counts empty.
 */

import { useEffect } from 'react';

import { fetchUnreadCounts } from '@/shared/chat/unreadApi';
import { useUnreadStore } from './useUnreadStore';

export function useUnreadSync(): void {
  const setCounts = useUnreadStore((s) => s.setCounts);
  useEffect(() => {
    let alive = true;
    const sync = () => {
      void fetchUnreadCounts().then((counts) => { if (alive) setCounts(counts); }).catch(() => undefined);
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    window.addEventListener('focus', sync);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('focus', sync);
    };
  }, [setCounts]);
}
