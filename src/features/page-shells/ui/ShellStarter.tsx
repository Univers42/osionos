// The empty-page starter: the shell catalogue offered on the owner's empty page.
// ADR 0064 PS19 decides when it shows (shellStarterGate); PS18 keeps the catalogue
// a code module read here directly, never a page.
//
// Caveat: when the confirming fetch fails, the starter stays hidden until the page
// is opened again; an empty page then just shows the editor's own placeholder.

import React, { useEffect, useSyncExternalStore } from "react";

import { useLayoutModes } from "@/entities/block/ui/layoutModes";
import { useUserStore } from "@/features/auth";
import { usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import { Card } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { serverBodyOf, subscribeServerCopies } from "@/store/sync/serverFetchedPages";

import { applyShell, type ShellTarget } from "../model/applyShell";
import { shellStarterState } from "../model/shellStarterGate";
import { usePageShellCards } from "../model/usePageShellCards";

interface ShellStarterProps {
  pageId: string;
  locked: boolean;
  target: ShellTarget;
}

function useStarterState(pageId: string, locked: boolean) {
  const page = usePageStore((s) => s.pageById(pageId));
  const context = usePageAccessContext();
  const serverBody = useSyncExternalStore(subscribeServerCopies, () => serverBodyOf(pageId));
  const state = page ? shellStarterState({ page, context, serverBody, locked }) : "none";
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  useEffect(() => {
    if (state === "fetch" && jwt) void fetchPageContent(pageId, jwt);
  }, [state, jwt, pageId, fetchPageContent]);
  return state;
}

// Shells are built from layout containers, so the starter ships with their rendering
// (ADR 0064 PS10): flag off counts as locked, which also skips the confirming fetch.
export const ShellStarter: React.FC<ShellStarterProps> = ({ pageId, locked, target }) => {
  const layoutModes = useLayoutModes();
  const cards = usePageShellCards();
  if (useStarterState(pageId, locked || !layoutModes) !== "offer" || cards.length === 0) return null;
  return (
    <section data-testid="shell-starter" aria-labelledby={`shell-starter-${pageId}`} className="mt-2 flex flex-col gap-3 pb-8">
      <h2 id={`shell-starter-${pageId}`} className="text-sm font-medium text-[var(--osio-fg-muted)]">
        Or start from a page shell
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
        {cards.map((card) => (
          <Card
            key={card.id}
            icon={<span aria-hidden="true">{card.icon}</span>}
            title={card.title}
            description={card.description}
            onClick={() => void applyShell(card.id, target)}
          />
        ))}
      </div>
    </section>
  );
};
