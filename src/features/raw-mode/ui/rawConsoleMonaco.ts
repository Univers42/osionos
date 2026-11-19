/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rawConsoleMonaco.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console's Monaco adapter: the catalogue becomes completion and hover, the
// diagnostics become markers. Imported only by RawMonacoPane, so it rides the lazy chunk.
// Providers are registered once, on the raw scheme alone: the IDE's markdown files keep
// Monaco's plain markdown, and completion works before the markdown grammar has loaded.
import { editor, languages, MarkerSeverity, Range } from "@/features/ide/model/monacoRuntime";
import { consoleCompletions, consoleHover, type ConsoleItemKind } from "../model/consoleCatalogue";
import type { ConsoleDiagnostic } from "../model/consoleDiagnostics";

export const RAW_CONSOLE_SCHEME = "osionos-raw";

const SELECTOR: languages.LanguageFilter = { scheme: RAW_CONSOLE_SCHEME };
const ITEM_KIND: Readonly<Record<ConsoleItemKind, languages.CompletionItemKind>> = {
  kind: languages.CompletionItemKind.Module,
  key: languages.CompletionItemKind.Property,
  value: languages.CompletionItemKind.Value,
};
let isRegistered = false;
// The providers serve every raw model, so the osio.layout.modes reading of the pane that owns
// a model travels with that model. Unset reads as off, the flag's default.
const layoutModesOf = new WeakMap<editor.ITextModel, boolean>();

export function setConsoleLayoutModes(model: editor.ITextModel, isOn: boolean): void {
  layoutModesOf.set(model, isOn);
}

function provideCompletionItems(model: editor.ITextModel, position: { lineNumber: number; column: number }): languages.CompletionList {
  const prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const { startColumn, items } = consoleCompletions(prefix, { layoutModes: layoutModesOf.get(model) === true });
  const range = new Range(position.lineNumber, startColumn, position.lineNumber, position.column);
  const suggestions = items.map((item) => ({
    label: item.label, detail: item.detail, kind: ITEM_KIND[item.kind], insertText: item.label, sortText: item.sortText, range,
  }));
  return { suggestions };
}

function provideHover(model: editor.ITextModel, position: { lineNumber: number; column: number }): languages.Hover | null {
  const found = consoleHover(model.getLineContent(position.lineNumber), position.column);
  if (found === null) return null;
  return { range: new Range(position.lineNumber, found.startColumn, position.lineNumber, found.endColumn), contents: [{ value: found.text }] };
}

export function registerRawConsoleProviders(): void {
  if (isRegistered) return;
  isRegistered = true;
  languages.registerCompletionItemProvider(SELECTOR, { triggerCharacters: [":", "{", "=", " "], provideCompletionItems });
  languages.registerHoverProvider(SELECTOR, { provideHover });
}

/** A drop is a warning, not an error: the save goes through, without that attribute. */
export function setConsoleMarkers(model: editor.ITextModel, diagnostics: readonly ConsoleDiagnostic[]): void {
  editor.setModelMarkers(model, RAW_CONSOLE_SCHEME, diagnostics.map((found) => ({
    severity: MarkerSeverity.Warning,
    message: found.message,
    startLineNumber: found.line,
    endLineNumber: found.line,
    startColumn: found.startColumn,
    endColumn: found.endColumn,
  })));
}
