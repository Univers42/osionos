/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConnectivityNotices.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from 'react';

import { useToastStore } from '@osionos/ui/primitives/useToastStore';
import { connectivityNotice, connectivityStatus, useConnectivityStore } from '@/shared/api/connectivity';

/** Feeds the browser's online flag to the connectivity store and says each change of connection once (#176). Mounted once, in App. */
export function useConnectivityNotices(): void {
  useEffect(() => {
    const { setBrowserOnline } = useConnectivityStore.getState();
    const online = () => setBrowserOnline(true);
    const offline = () => setBrowserOnline(false);
    globalThis.addEventListener('online', online);
    globalThis.addEventListener('offline', offline);
    const unsubscribe = useConnectivityStore.subscribe((state, previous) => {
      const notice = connectivityNotice(connectivityStatus(previous), connectivityStatus(state));
      if (notice) useToastStore.getState().push(notice);
    });
    return () => {
      globalThis.removeEventListener('online', online);
      globalThis.removeEventListener('offline', offline);
      unsubscribe();
    };
  }, []);
}
