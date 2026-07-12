/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AnimatedTab.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef } from "react";
import { NOTO_ANIMATED_BASE, NOTO_ANIMATED_DATA } from "./notoAnimated.generated";
import { VirtualGrid } from "./VirtualRows";

interface AnimatedEmoji {
  cp: string;
  name: string;
}

const ITEMS: AnimatedEmoji[] = NOTO_ANIMATED_DATA.split("\n").map((line) => {
  const [cp, name] = line.split("|");
  return { cp, name };
});

/** gstatic-hosted animated WebP for one Noto emoji (also available as /512.gif). */
export function notoAnimatedUrl(cp: string): string {
  return `${NOTO_ANIMATED_BASE}/${cp}/512.webp`;
}

/** Google Noto animated-emoji grid (~880, virtualized). Picking stores the asset
 *  URL as a regular `img:` icon, so it animates everywhere icons render. Previews
 *  load lazily from fonts.gstatic.com — offline they simply stay blank. */
export const AnimatedTab: React.FC<{ query: string; onPick: (url: string) => void }> = ({ query, onPick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [{ title: `Animated · Noto Emoji · ${ITEMS.length}`, items: ITEMS }];
    return [{ items: ITEMS.filter((item) => item.name.includes(q)) }];
  }, [query]);

  if (sections.every((section) => section.items.length === 0)) {
    return <p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">No animated emoji match “{query}”.</p>;
  }
  return (
    <div ref={scrollRef} className="h-full overflow-auto py-1">
      <VirtualGrid
        scrollRef={scrollRef}
        sections={sections}
        perRow={8}
        renderItem={(item) => (
          <button
            key={item.cp}
            type="button"
            title={item.name}
            onClick={() => onPick(notoAnimatedUrl(item.cp))}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
          >
            <img src={notoAnimatedUrl(item.cp)} alt={item.name} width={26} height={26} loading="lazy" draggable={false} />
          </button>
        )}
      />
    </div>
  );
};

export default AnimatedTab;
