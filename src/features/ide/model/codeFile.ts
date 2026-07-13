/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   codeFile.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { languageForFileName } from "./ideLanguages";

/**
 * A `surface: "code"` page stores its whole file as ONE `code` block in
 * `page.content` — so it rides the existing page-save path (stamp/outbox/
 * hydrate) with no new table or route. These helpers are the single seam
 * between "a page" and "a code file": the CodeMirror view reads the block's
 * text + language, and writes edits straight back into the block. `content`
 * stays `Block[]`, so nothing about page sync or ACL changes.
 */

/** A fresh `code` block for a new code file, language inferred from the name. */
export function createCodeFileBlock(fileName: string, content = ""): Block {
  return {
    id: crypto.randomUUID(),
    type: "code",
    content,
    language: languageForFileName(fileName).id,
    fileName,
    lineNumbers: true,
    codeTheme: "dark",
  };
}

/** The single code block backing a code-surface page (the first `code` block). */
export function codeBlockOf(page: PageEntry | undefined): Block | undefined {
  return page?.content?.find((b) => b.type === "code");
}
