// The AI Hub pane: a list of sections on the left (stacked above below 640 px) and the
// selected section on the right. It composes the Settings panels; it owns no AI setting.
// A section, not <main>: the workspace already has the page's one main landmark.
import React from "react";
import { useAiHubNav } from "@/features/ai/model/aiHubNav";
import { HUB_SECTIONS } from "./hubSections";
import { HubSectionBody } from "./HubSectionBody";

export const AiHubView: React.FC = () => {
  const selected = useAiHubNav((state) => state.section);
  const request = useAiHubNav((state) => state.request);
  const current = HUB_SECTIONS.find((section) => section.id === selected) ?? HUB_SECTIONS[0];
  return (
    <div className="flex h-full flex-col overflow-hidden min-[640px]:flex-row">
      <nav
        aria-label="AI Hub sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--osio-border-default)] p-2 min-[640px]:w-56 min-[640px]:flex-col min-[640px]:border-b-0 min-[640px]:border-r"
      >
        {HUB_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={section.id === selected ? "page" : undefined}
            onClick={() => request(section.id)}
            className="whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)] aria-[current=page]:bg-[var(--osio-bg-subtle)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--osio-fg-default)]"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <section aria-label={current.label} className="min-w-0 flex-1 overflow-y-auto p-4 min-[640px]:p-6">
        <h1 className="mb-4 text-xl font-semibold text-[var(--osio-fg-default)]">{current.label}</h1>
        <HubSectionBody id={selected} />
      </section>
    </div>
  );
};
