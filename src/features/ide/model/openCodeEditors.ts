/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openCodeEditors.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A mounted code editor owns its page's text and saves it back debounced, without reading
// the store (useMonacoEditor). A program edit to that page written only to the store would
// be overwritten by the editor's next save, so it goes through the editor. Monaco-free, so
// a caller outside the IDE chunk can use it.

export interface OpenCodeEditor {
  read(): string;
  replace(text: string): void;
}

const editors = new Map<string, OpenCodeEditor>();

/** Called by the editor on mount; the returned function unregisters it. */
export function registerOpenCodeEditor(pageId: string, editor: OpenCodeEditor): () => void {
  editors.set(pageId, editor);
  return () => {
    if (editors.get(pageId) === editor) editors.delete(pageId);
  };
}

/** The live editor of `pageId`, when one is mounted. Split panes share one model, so any one will do. */
export function openCodeEditor(pageId: string): OpenCodeEditor | undefined {
  return editors.get(pageId);
}
