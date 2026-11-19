/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-console.bench.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { consoleDiagnostics } from "../../src/features/raw-mode/model/consoleDiagnostics.ts";
import { parseRawSource } from "../../src/features/raw-mode/model/rawSave.ts";
import { defineBench } from "./harness.ts";

/** `sections` grids of two columns between paragraphs; every fifth grid carries two drops. */
function document(sections: number): string {
  const parts: string[] = [];
  for (let index = 0; index < sections; index += 1) {
    const cols = index % 5 === 0 ? "cols=9 bogus=1" : "cols=2";
    parts.push(`Paragraph ${index} with some **bold** text and a [link](https://example.com/${index}).`, "");
    parts.push(`::: grid {${cols} gap=2}`, ":::column", `Left ${index}`, ":::", ":::column {span=1}", `Right ${index}`, ":::", ":::", "");
  }
  return parts.join("\n");
}

const LARGE = document(200);

// The console reruns on every preview pause (90 ms debounce) while Advanced is on. The
// reference row is the parse the preview already pays for the same text.
// Budget 15 ms ≈ 3× the p95 measured 2026-11-19 (median 4.75 ms, p95 5.28 ms; the parse 2.23 ms
// p95): the single-line re-parses cost about 1.4 parses on top of the save's own.
export const bench = defineBench("raw console diagnostics", [
  { name: "parseRawSource, 200 grids (2 000 lines), reference", reference: true, setup: () => () => parseRawSource(LARGE) },
  { name: "consoleDiagnostics, 200 grids, 80 drops", budgetNs: 15e6, setup: () => () => consoleDiagnostics(LARGE) },
]);
