/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageBodyLoad.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";

import { useUserStore } from "@/features/auth";
import { isContentUnloaded } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";

export type PageBodyLoad = "ready" | "loading" | "failed" | "signed-out";

/**
 * Loads a saved page's body when the store holds only its metadata (the page list ships
 * none), and says what to show meanwhile. Every surface rendering a page (tabs, Home, record
 * peeks) goes through here, so none of them shows an empty editor over a body it never loaded.
 */
export function usePageBodyLoad(pageId: string): { state: PageBodyLoad; retry: () => void } {
  const unloaded = usePageStore((s) => {
    const page = s.pageById(pageId);
    return page !== undefined && isContentUnloaded(page);
  });
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const [attempt, setAttempt] = useState(0);
  const [failedLoad, setFailedLoad] = useState<string | null>(null);
  const loadKey = `${pageId}:${attempt}`;

  useEffect(() => {
    if (!unloaded || !jwt) return;
    let live = true;
    void fetchPageContent(pageId, jwt).then(() => {
      const page = usePageStore.getState().pageById(pageId);
      if (live && page && isContentUnloaded(page)) setFailedLoad(loadKey);
    });
    return () => { live = false; };
  }, [unloaded, jwt, pageId, fetchPageContent, loadKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!unloaded) return { state: "ready", retry };
  if (!jwt) return { state: "signed-out", retry };
  return { state: failedLoad === loadKey ? "failed" : "loading", retry };
}
