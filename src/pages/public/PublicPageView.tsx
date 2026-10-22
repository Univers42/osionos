/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicPageView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { IconValueView } from "@/shared/ui";
import { PageBlocksRenderer } from "@/widgets/page-renderer";
import { usePublicPage } from "./usePublicPage";

/** Standalone read-only render of a published page (unauthenticated /p/:token). */
export const PublicPageView: React.FC = () => {
  const { loading, page, error } = usePublicPage();

  return (
    <div className="min-h-dvh bg-[var(--osio-bg-canvas)] text-[var(--osio-fg-default)]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {loading && <p className="text-sm text-[var(--osio-fg-subtle)]">Loading…</p>}
        {!loading && error && (
          <div className="py-20 text-center">
            <p className="text-lg font-semibold">{error}</p>
            <p className="mt-1 text-sm text-[var(--osio-fg-subtle)]">Ask the author for a fresh link.</p>
          </div>
        )}
        {!loading && page && (
          <article>
            <header className="mb-6 flex items-center gap-3">
              {page.icon && <IconValueView value={page.icon} size={32} />}
              <h1 className="text-3xl font-bold leading-tight">{page.title}</h1>
            </header>
            <PageBlocksRenderer blocks={page.content} />
            <footer className="mt-16 border-t border-[var(--osio-border-default)] pt-4 text-xs text-[var(--osio-fg-subtle)]">
              Published with osionos
            </footer>
          </article>
        )}
      </div>
    </div>
  );
};
