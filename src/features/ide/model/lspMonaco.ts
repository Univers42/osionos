/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspMonaco.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { editor, languages, MarkerSeverity, Range, Uri, type IDisposable, type IMarkdownString, type IPosition } from "./monacoRuntime";
import { acquireLspClient, lspDocumentLanguage } from "./lspClient";
import { useDiagnosticsStore, type IdeDiagnostic } from "./diagnosticsStore";
import { useIdeRevealBus } from "./ideRevealBus";
import { findPageByRelPath } from "./ideFileLookup";
import type {
  LspClient, LspCompletionItem, LspCompletionList, LspHover, LspLocation, LspLocationLink, LspMarkupContent,
  LspPosition, LspRange, LspSignatureHelp,
} from "./lspProtocol";

// The Monaco side of the language-server integration: one open document per
// model (didOpen / debounced full-text didChange / didClose), providers for
// completion, hover, signature help and go-to-definition registered ONCE per
// Monaco language, and diagnostics from the store rendered as model markers.
// Providers are global in Monaco, so each call looks its document up by URI and
// answers nothing for a model that has no server — that is what keeps the
// editor quiet outside IDE mode.

const MARKER_OWNER = "osio-lsp";
const CHANGE_DEBOUNCE_MS = 120;
const URI_PREFIX = "file:///workspace/";
const EMPTY: IdeDiagnostic[] = [];

interface OpenDocument {
  client: LspClient;
  uri: string;
  model: editor.ITextModel;
  version: number;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  refs: number;
  subscriptions: IDisposable[];
}

const documents = new Map<string, OpenDocument>();
const providersByLanguage = new Set<string>();
let openerRegistered = false;

const toLspPosition = (p: IPosition): LspPosition => ({ line: p.lineNumber - 1, character: p.column - 1 });
const toRange = (r: LspRange): Range => new Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
const fence = (lang: string, value: string): string => "```" + lang + "\n" + value + "\n```";

function documentFor(model: editor.ITextModel): OpenDocument | null {
  return documents.get(model.uri.toString()) ?? null;
}

// Full-text sync: simple, exact, and cheap at the file sizes a page holds. A
// request always flushes first so the server never answers about stale text.
function sendChange(doc: OpenDocument): void {
  if (doc.timer) { clearTimeout(doc.timer); doc.timer = null; }
  if (!doc.dirty || doc.model.isDisposed()) return;
  doc.dirty = false;
  doc.version += 1;
  doc.client.notify("textDocument/didChange", { textDocument: { uri: doc.uri, version: doc.version }, contentChanges: [{ text: doc.model.getValue() }] });
}

function scheduleChange(doc: OpenDocument): void {
  doc.dirty = true;
  if (doc.timer) clearTimeout(doc.timer);
  doc.timer = setTimeout(() => sendChange(doc), CHANGE_DEBOUNCE_MS);
}

async function requestFor<T>(model: editor.ITextModel, method: string, params: object): Promise<T | null> {
  const doc = documentFor(model);
  if (!doc) return null;
  sendChange(doc);
  try {
    return await doc.client.request<T | null>(method, { textDocument: { uri: doc.uri }, ...params });
  } catch {
    return null; // a timed-out or closed server degrades to "no answer", never an error toast
  }
}

function toDocumentation(doc: string | LspMarkupContent | undefined): string | IMarkdownString | undefined {
  if (doc === undefined) return undefined;
  if (typeof doc === "string") return doc;
  return doc.kind === "markdown" ? { value: doc.value } : doc.value;
}

const KINDS = ((K) => [
  K.Text, K.Method, K.Function, K.Constructor, K.Field, K.Variable, K.Class, K.Interface, K.Module, K.Property, K.Unit, K.Value,
  K.Enum, K.Keyword, K.Snippet, K.Color, K.File, K.Reference, K.Folder, K.EnumMember, K.Constant, K.Struct, K.Event, K.Operator, K.TypeParameter,
])(languages.CompletionItemKind);

function toCompletionItem(item: LspCompletionItem, fallback: Range): languages.CompletionItem {
  const edit = item.textEdit;
  const range = edit ? ("range" in edit ? toRange(edit.range) : { insert: toRange(edit.insert), replace: toRange(edit.replace) }) : fallback;
  return {
    label: item.label,
    kind: KINDS[(item.kind ?? 1) - 1] ?? languages.CompletionItemKind.Text,
    insertText: edit?.newText ?? item.insertText ?? item.label,
    insertTextRules: item.insertTextFormat === 2 ? languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range,
    detail: item.detail,
    documentation: toDocumentation(item.documentation),
    filterText: item.filterText,
    sortText: item.sortText,
    additionalTextEdits: item.additionalTextEdits?.map((e) => ({ range: toRange(e.range), text: e.newText })),
  };
}

async function provideCompletionItems(model: editor.ITextModel, position: IPosition, context: languages.CompletionContext): Promise<languages.CompletionList | null> {
  const triggerKind = context.triggerKind === languages.CompletionTriggerKind.TriggerCharacter ? 2
    : context.triggerKind === languages.CompletionTriggerKind.TriggerForIncompleteCompletions ? 3 : 1;
  const result = await requestFor<LspCompletionList | LspCompletionItem[]>(model, "textDocument/completion", {
    position: toLspPosition(position), context: { triggerKind, triggerCharacter: context.triggerCharacter },
  });
  if (!result) return null;
  const items = Array.isArray(result) ? result : result.items;
  const word = model.getWordUntilPosition(position);
  const fallback = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  return { suggestions: items.map((item) => toCompletionItem(item, fallback)), incomplete: !Array.isArray(result) && result.isIncomplete };
}

function hoverContents(contents: LspHover["contents"]): IMarkdownString[] {
  const parts = Array.isArray(contents) ? contents : [contents];
  return parts
    .map((part): IMarkdownString => {
      if (typeof part === "string") return { value: part };
      if ("kind" in part) return part.kind === "markdown" ? { value: part.value } : { value: fence("", part.value) };
      return { value: fence(part.language, part.value) };
    })
    .filter((md) => md.value.trim().length > 0);
}

async function provideHover(model: editor.ITextModel, position: IPosition): Promise<languages.Hover | null> {
  const hover = await requestFor<LspHover>(model, "textDocument/hover", { position: toLspPosition(position) });
  if (!hover) return null;
  const contents = hoverContents(hover.contents);
  return contents.length === 0 ? null : { contents, range: hover.range ? toRange(hover.range) : undefined };
}

async function provideDefinition(model: editor.ITextModel, position: IPosition): Promise<languages.Location[] | null> {
  const result = await requestFor<LspLocation | LspLocation[] | LspLocationLink[]>(model, "textDocument/definition", { position: toLspPosition(position) });
  if (!result) return null;
  const list = Array.isArray(result) ? result : [result];
  return list.map((loc) =>
    "targetUri" in loc
      ? { uri: Uri.parse(loc.targetUri), range: toRange(loc.targetSelectionRange ?? loc.targetRange) }
      : { uri: Uri.parse(loc.uri), range: toRange(loc.range) },
  );
}

async function provideSignatureHelp(model: editor.ITextModel, position: IPosition): Promise<languages.SignatureHelpResult | null> {
  const help = await requestFor<LspSignatureHelp>(model, "textDocument/signatureHelp", { position: toLspPosition(position) });
  if (!help || help.signatures.length === 0) return null;
  return {
    value: {
      signatures: help.signatures.map((s) => ({
        label: s.label,
        documentation: toDocumentation(s.documentation),
        parameters: (s.parameters ?? []).map((p) => ({ label: p.label, documentation: toDocumentation(p.documentation) })),
      })),
      activeSignature: help.activeSignature ?? 0,
      activeParameter: help.activeParameter ?? 0,
    },
    dispose: () => undefined,
  };
}

function ensureProviders(monacoId: string): void {
  if (providersByLanguage.has(monacoId)) return;
  providersByLanguage.add(monacoId);
  languages.registerCompletionItemProvider(monacoId, { triggerCharacters: [".", ":", ">", "(", '"', "'", "/", "<", "@", "#"], provideCompletionItems });
  languages.registerHoverProvider(monacoId, { provideHover });
  languages.registerDefinitionProvider(monacoId, { provideDefinition });
  languages.registerSignatureHelpProvider(monacoId, { signatureHelpTriggerCharacters: ["(", ","], signatureHelpRetriggerCharacters: [","], provideSignatureHelp });
}

// A definition in ANOTHER file: Monaco asks the opener for the resource; the
// answer is the IDE's own "open this page and reveal line:col" hand-off.
function ensureOpener(): void {
  if (openerRegistered) return;
  openerRegistered = true;
  editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      const uri = resource.toString();
      if (!uri.startsWith(URI_PREFIX)) return false;
      const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
      const target = findPageByRelPath(workspaceId, decodeURIComponent(uri.slice(URI_PREFIX.length)));
      if (!target) return false;
      const at = selectionOrPosition;
      const line = at ? ("startLineNumber" in at ? at.startLineNumber : at.lineNumber) : 1;
      const col = at ? ("startColumn" in at ? at.startColumn : at.column) : 1;
      useIdeRevealBus.getState().request({ pageId: target.id, line, col });
      usePageStore.getState().openPage({ id: target.id, workspaceId, kind: "page", title: target.title });
      return true;
    },
  });
}

const SEVERITY: Record<number, MarkerSeverity> = { 1: MarkerSeverity.Error, 2: MarkerSeverity.Warning, 3: MarkerSeverity.Info, 4: MarkerSeverity.Hint };

function applyMarkers(model: editor.ITextModel, diagnostics: IdeDiagnostic[]): void {
  if (model.isDisposed()) return;
  editor.setModelMarkers(model, MARKER_OWNER, diagnostics.map((d) => ({
    severity: SEVERITY[d.severity] ?? MarkerSeverity.Error,
    message: d.message,
    source: d.source,
    startLineNumber: d.line + 1,
    startColumn: d.character + 1,
    endLineNumber: (d.endLine ?? d.line) + 1,
    endColumn: d.endCharacter === undefined ? d.character + 2 : d.endCharacter + 1,
  })));
}

function releaseDocument(doc: OpenDocument): void {
  doc.refs -= 1;
  if (doc.refs > 0) return;
  documents.delete(doc.model.uri.toString());
  if (doc.timer) clearTimeout(doc.timer);
  for (const sub of doc.subscriptions) sub.dispose();
  doc.client.notify("textDocument/didClose", { textDocument: { uri: doc.uri } });
  applyMarkers(doc.model, EMPTY);
  useDiagnosticsStore.getState().setForUri(doc.uri, EMPTY);
}

/**
 * Wire `model` to its language server: returns a disposable that closes the
 * document, or null when there is no server (unknown language, bridge
 * unconfigured, sandbox stopped). Safe to call twice for one model (two panes):
 * the document is shared and closed on the last dispose.
 */
export async function attachLsp(model: editor.ITextModel, languageId: string, monacoId: string, uri: string, workspaceId: string): Promise<IDisposable | null> {
  const client = await acquireLspClient(languageId, workspaceId);
  if (!client || model.isDisposed()) return null;
  ensureProviders(monacoId);
  ensureOpener();
  const key = model.uri.toString();
  const existing = documents.get(key);
  if (existing) { existing.refs += 1; return { dispose: () => releaseDocument(existing) }; }
  const doc: OpenDocument = { client, uri, model, version: 1, dirty: false, timer: null, refs: 1, subscriptions: [] };
  documents.set(key, doc);
  client.notify("textDocument/didOpen", { textDocument: { uri, languageId: lspDocumentLanguage(languageId), version: 1, text: model.getValue() } });
  doc.subscriptions.push(model.onDidChangeContent(() => scheduleChange(doc)));
  let last: IdeDiagnostic[] | undefined;
  const unsubscribe = useDiagnosticsStore.subscribe((state) => {
    const next = state.byUri[uri];
    if (next !== last) { last = next; applyMarkers(model, next ?? EMPTY); }
  });
  doc.subscriptions.push({ dispose: unsubscribe });
  applyMarkers(model, useDiagnosticsStore.getState().byUri[uri] ?? EMPTY);
  return { dispose: () => releaseDocument(doc) };
}
