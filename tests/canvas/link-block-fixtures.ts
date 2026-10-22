/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   link-block-fixtures.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { readFileSync } from "node:fs";

import type { Block } from "../../src/entities/block/model/types.ts";
import { parseEmbedSnapshot, type EmbedSnapshot } from "../../src/shared/lib/embed/embedInfo.ts";

const sample: unknown = JSON.parse(readFileSync(new URL("../fixtures/embed-info.sample.json", import.meta.url), "utf8"));

/** A valid snapshot: the shared bridge fixture plus a timestamp. */
export const SNAPSHOT: EmbedSnapshot = (() => {
  const parsed = parseEmbedSnapshot({ ...(sample as Record<string, unknown>), resolvedAt: "2026-10-18T12:00:00.000Z" });
  if (parsed === null) throw new Error("the shared embed fixture must parse");
  return parsed;
})();

export const PAGE_URL = "https://vimeo.example/76979871";

let seq = 0;
export const linkBlock = (type: "embed" | "bookmark", extra: Partial<Block> = {}): Block => ({
  id: `l${seq++}`,
  type,
  content: PAGE_URL,
  embed: SNAPSHOT,
  ...extra,
});

/** Block JSON as a hostile collaborator would write it: every URL field and text field is an attack. */
export const HOSTILE_SNAPSHOT: unknown = {
  ...SNAPSHOT,
  title: '<script>alert(1)</script> "x" & co',
  description: "<img src=x onerror=alert(1)>",
  image: "javascript:alert(1)",
  favicon: "data:text/html,<script>1</script>",
  player: { src: "javascript:alert(2)", aspect: "16/9" },
};
