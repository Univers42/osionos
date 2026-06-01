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

import { Profiler, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App.tsx";
import { recordReactCommit } from '@/shared/lib/perf/measure';
import '@notion-db/object-database/theme.css';
import 'leaflet/dist/leaflet.css';
import './styles/_graphical-chart.scss';
import './styles/global.css';
import '@/shared/lib/perf/loadTest';

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* react-doctor/require-reduced-motion: honour user's OS-level
          prefers-reduced-motion preference for every motion component (WCAG
          2.3.3). `reducedMotion="user"` is the recommended default. */}
      <MotionConfig reducedMotion="user">
        <Profiler id="App" onRender={recordReactCommit}>
          <App />
        </Profiler>
      </MotionConfig>
    </StrictMode>,
  );
}
