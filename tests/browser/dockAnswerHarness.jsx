/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dockAnswerHarness.jsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The dock's answer bubble with cited sources (#84). The dock itself renders nothing
// without an AI service, which the offline e2e build never has, so the bubble is mounted
// here inside the dock's own frame classes.

import React from "react";
import { createRoot } from "react-dom/client";

import "@/app/styles/global.css";
import { DockAnswer } from "@/widgets/contact-dock/ui/AiDockPanel";

const citations = [
  { collection: "page", n: 1, pageId: "page-q3", title: "Q3 report", snippet: "Revenue rose 12% on the quarter." },
  { collection: "web", n: 2, url: "https://example.com/markets", domain: "example.com", title: "Markets", snippet: "Sector growth was 8%." },
];

function App() {
  return (
    <main className="p-8">
      <section
        data-testid="dock-answer"
        aria-label="AI assistant"
        className="flex w-[19rem] flex-col gap-[var(--osio-space-2)] rounded-t-lg border border-l-2 border-[var(--osio-border-default)] border-l-[var(--osio-accent)] bg-[var(--osio-bg-elevated)] px-[var(--osio-space-3)] py-[var(--osio-space-3)]"
      >
        <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-md bg-[var(--osio-accent)] px-[var(--osio-space-3)] py-[var(--osio-space-2)] text-sm text-[var(--osio-accent-fg)]">
          How did Q3 go?
        </div>
        <div className="max-w-[85%] rounded-md bg-[var(--osio-bg-subtle)] px-[var(--osio-space-3)] py-[var(--osio-space-2)] text-sm text-[var(--osio-fg-default)]">
          <DockAnswer body={"Revenue rose 12% [1], ahead of the sector's 8% [2]."} citations={citations} />
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
