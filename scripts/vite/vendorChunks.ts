/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vendorChunks.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Build-time chunk placement for the big, stable vendors (vite.config.ts manualChunks): their
// own chunks cache across deploys and download in parallel with the entry.
//
// A manual chunk takes EVERY module its rule matches, including modules the app reaches only
// through a dynamic import - those then load with the chunk. Measured 2026-10-13 on the prod
// build: a `/react/` path-segment rule put react-dom/server (190 KB, dynamic-imported by
// inlineIconInsert.ts to keep it off the warm path) and @univers42/ui-collection's
// dist/library/components/react/** (142 KB) into the eager vendor-react chunk. So every rule
// names the package directory right after node_modules/, and react-dom/server is left to the
// import graph.

const packageDir = (names: string) => new RegExp(`[/\\\\]node_modules[/\\\\](?:${names})[/\\\\]`);

const REACT_DOM_SERVER = /[/\\]node_modules[/\\]react-dom[/\\](?:server|cjs[/\\]react-dom-server)/;
const RULES: readonly (readonly [RegExp, string])[] = [
  [packageDir("react|react-dom|scheduler|use-sync-external-store"), "vendor-react"],
  [packageDir("motion|framer-motion|motion-dom"), "vendor-motion"],
  [packageDir("@univers42"), "vendor-ui-collection"],
  [packageDir("date-fns"), "vendor-date-fns"],
  [packageDir("@tanstack"), "vendor-tanstack"],
];

/** The vendor chunk a resolved module id belongs to, or undefined to follow the import graph. */
export function vendorChunkOf(id: string): string | undefined {
  if (REACT_DOM_SERVER.test(id)) return undefined;
  for (const [rule, chunk] of RULES) if (rule.test(id)) return chunk;
  return undefined;
}
