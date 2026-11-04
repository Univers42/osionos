import React, { useEffect, useRef, useState } from "react";

import type { BoardHandle, BoardTheme } from "@hydrawn/board";

const themeOf = (): BoardTheme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

interface Props {
  slug: string;
  title: string;
}

/** The board drawn in this page (`osio.whiteboard.inprocess`), in place of the frame: an open
 *  shadow root keeps hydrawn's stylesheet and osionos' apart, and the library loads on first
 *  mount, so a page with no whiteboard never fetches it. It follows `<html data-theme>`. */
export const InProcessBoard: React.FC<Props> = ({ slug, title }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  // Read at the first save, which creates the board: a rename while it is open does not remount.
  const titleRef = useRef(title);
  titleRef.current = title;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Open: the board reads the node an event started on, which a closed root hides.
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let board: BoardHandle | null = null;
    let gone = false;
    const observer = new MutationObserver(() => board?.setTheme(themeOf()));
    void import("../model/inProcessBoard")
      .then(async ({ mountInProcessBoard }) => {
        if (gone) return;
        const mounted = await mountInProcessBoard(shadow, { slug, title: () => titleRef.current, theme: themeOf() });
        if (gone) {
          void mounted.destroy();
          return;
        }
        board = mounted;
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      observer.disconnect();
      void board?.destroy();
    };
  }, [slug]);

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--osio-fg-subtle)]">
        The whiteboard could not load.
      </div>
    );
  }
  // The board's chrome takes the app's typeface: the library ships no font of its own.
  return <div ref={hostRef} data-testid="whiteboard-inprocess" className="relative min-h-0 flex-1" style={{ fontFamily: "var(--font-sans)" }} />;
};
