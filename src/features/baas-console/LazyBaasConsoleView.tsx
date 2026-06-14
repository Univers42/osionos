/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LazyBaasConsoleView.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Code-split boundary for the BaaS console. The whole feature (panel + sections
 * + store + client) is its own async chunk, so a workspace that never opens the
 * console never downloads it — and a stock build (no BaaS env) never paints it.
 */

import React, { Suspense, lazy } from "react";

const BaasConsolePanel = lazy(() =>
  import("./ui/BaasConsolePanel").then((m) => ({ default: m.BaasConsolePanel })),
);

const ConsoleLoading: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
  </div>
);

/** Suspense-wrapped console panel — drop-in for a pane/surface slot. */
export const LazyBaasConsoleView: React.FC = () => (
  <Suspense fallback={<ConsoleLoading />}>
    <BaasConsolePanel />
  </Suspense>
);
