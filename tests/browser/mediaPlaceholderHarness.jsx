/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaPlaceholderHarness.jsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/27 10:00:37 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/27 10:00:38 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { createRoot } from "react-dom/client";

import "@/app/styles/global.css";
import { MediaBlockPreview } from "@/entities/block/ui/MediaBlockPreview";

const blocks = [
  { id: "image-placeholder", type: "image", content: "", asset: undefined },
  { id: "video-placeholder", type: "video", content: "", asset: undefined },
  { id: "audio-placeholder", type: "audio", content: "", asset: undefined },
  { id: "file-placeholder", type: "file", content: "", asset: undefined },
];

function App() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-primary)] p-8">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {blocks.map((block) => (
          <section
            key={block.id}
            data-testid={block.id}
            className="rounded-xl border border-[var(--color-line)] p-4"
          >
            <MediaBlockPreview block={block} />
          </section>
        ))}
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
