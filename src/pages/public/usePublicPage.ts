/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePublicPage.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import type { Block } from "@/entities/block";

export interface PublicPage {
  title: string;
  icon: string | null;
  content: Block[];
  publishedAt: string;
}

interface PublicPageState {
  loading: boolean;
  page: PublicPage | null;
  error: string | null;
}

function tokenFromPath(): string {
  const raw = globalThis.location?.pathname.replace(/^\/p\//, "").split(/[/?#]/)[0] ?? "";
  return /^[0-9a-f]{32}$/.test(raw) ? raw : "";
}

/** Fetch a published page snapshot by its /p/:token (unauthenticated read). */
export function usePublicPage(): PublicPageState {
  const [token] = useState(tokenFromPath);
  const [state, setState] = useState<PublicPageState>(() => ({ loading: Boolean(token), page: null, error: token ? null : "This link is invalid." }));

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api.get<{ ok?: boolean; title?: string; icon?: string | null; content?: Block[]; publishedAt?: string }>(`/api/public/pages/${token}`)
      .then((res) => {
        if (!alive) return;
        if (res.ok) setState({ loading: false, page: { title: res.title ?? "Untitled", icon: res.icon ?? null, content: res.content ?? [], publishedAt: res.publishedAt ?? "" }, error: null });
        else setState({ loading: false, page: null, error: "This page is not published." });
      })
      .catch(() => { if (alive) setState({ loading: false, page: null, error: "This page is not available." }); });
    return () => { alive = false; };
  }, [token]);

  return state;
}
