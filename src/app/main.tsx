/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 18:59:04 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Database (object-database) theme + leaflet styles ship with the lazy
// DatabaseBlock chunk (perf: off the render-blocking entry CSS), not here.
import './styles/_graphical-chart.scss';
import './styles/global.css';

// The load-test/perf harness is a dev-only tool — keep its store/perf code out
// of the production entry bundle (cuts initial JS parse / TBT on mobile).
if (import.meta.env.DEV) {
  void import('@/shared/lib/perf/loadTest');
}

// Self-recover from stale lazy chunks after a redeploy: when a dynamic import
// 404s (its hashed file was replaced), Vite fires `vite:preloadError`. Reload
// once to pull the fresh manifest, guarded so a genuinely-missing chunk can't
// loop. Without this, an open tab keeps throwing "Failed to fetch dynamically
// imported module" for mermaid, the database view, etc.
globalThis.addEventListener("vite:preloadError", () => {
  const key = "osionos:preload-reloaded-at";
  const last = Number(globalThis.sessionStorage?.getItem(key) ?? 0);
  if (Date.now() - last > 10_000) {
    globalThis.sessionStorage?.setItem(key, String(Date.now()));
    globalThis.location.reload();
  }
});

const root = document.getElementById("root");
if (root) {
  // Note: framer-motion (motion/react) was removed for the preact/compat
  // migration — it is structurally incompatible with Preact (reads React fiber
  // internals). The app animates via CSS only, and prefers-reduced-motion is
  // honoured in CSS (@media), so MotionConfig had nothing to configure.
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
