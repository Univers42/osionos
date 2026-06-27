/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShareHost.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Mounted once in App: renders the SharePopover for whatever resource the
 * global useShareTarget store points at, so non-React callers (the page
 * context menu's "Share") can open it. Lazy so the share feature stays out of
 * the warm chunk until a share is requested.
 */

import React, { Suspense, lazy } from "react";
import { useShareTarget } from "./useShareTarget";

const LazySharePopover = lazy(() =>
  import("./SharePopover").then((m) => ({ default: m.SharePopover })),
);

export const ShareHost: React.FC = () => {
  const resource = useShareTarget((s) => s.resource);
  const close = useShareTarget((s) => s.close);
  if (!resource) return null;
  return (
    <Suspense fallback={null}>
      <LazySharePopover resource={resource} onClose={close} />
    </Suspense>
  );
};
