/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBody.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 18:59:04 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from 'react';
import { PlaygroundPageEditor } from '@/features/block-editor';
import { isPerfEnabled } from '@/shared/lib/perf/measure';
import { resolvePageConfig, usePageConfigStore } from '@/shared/config/pageConfigStore';
import { useUserStore } from '@/features/auth';
import { RawModeView } from '@/features/raw-mode';

interface PageBodyProps {
  pageId: string;
  locked?: boolean;
}

/**
 * Content area — wraps the PlaygroundPageEditor which integrates
 * the markengine for markdown shortcuts and block-level editing. When the page
 * is in raw mode it swaps in the VSCode-style markdown source editor instead.
 */
export const PageBody: React.FC<PageBodyProps> = ({ pageId, locked = false }) => {
  const renderCountRef = useRef(0);
  // Count COMMITTED renders in a dep-less effect: writing a ref during
  // render is illegal under react-hooks/refs (and invisible to React).
  useEffect(() => { renderCountRef.current += 1; });
  const userId = useUserStore((state) => state.activeUserId) || 'anonymous';
  const rawMode = usePageConfigStore((state) => resolvePageConfig(state.configs[`${userId}:${pageId}`]).rawMode);

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] PageBody renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  if (rawMode) {
    return (
      <div className="osionos-raw-mode flex h-[calc(100vh-7rem)] min-h-[420px] w-full flex-col overflow-hidden rounded-lg border border-[var(--osio-border-default)]">
        <RawModeView pageId={pageId} />
      </div>
    );
  }

  return (
    <div className="osionos-page-body">
      <PlaygroundPageEditor pageId={pageId} locked={locked} />
    </div>
  );
};
