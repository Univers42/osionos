/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SearchPanelSlot.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, lazy } from "react";

// The find & replace panel is its own feature (code-split so its matcher/engine
// only load when Search is opened).
const LazySearchPanel = lazy(() =>
  import("@/features/search/ui/SearchPanel").then((m) => ({ default: m.SearchPanel })),
);

export const SearchPanelSlot: React.FC = () => (
  <Suspense fallback={<div className="h-full" aria-busy="true" />}>
    <LazySearchPanel />
  </Suspense>
);
