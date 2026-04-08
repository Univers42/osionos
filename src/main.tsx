/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 22:07:37 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@src/index.css";
import { initFormulaEngine } from "@src/lib/engine/bridge";

// Eagerly init theme so data-theme applies before first paint
import "@src/store/dbms/hardcoded/useThemeStore.ts";

async function bootstrap() {
  try {
    await initFormulaEngine();
  } finally {
    const root = document.getElementById("root");
    if (root) {
      createRoot(root).render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    }
  }
}

void bootstrap();
