/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoRuntime.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The ONE place the Monaco core enters the bundle. `monaco-editor/editor` is the
// tree-shakeable core (0.56 layout); the editor features are opted into one by
// one below — the shipped CodeMirror posture was "colors and be able to write
// code, no IntelliSense", with the sandbox LSP as the sanctioned exception, so
// the feature set is the editing basics + the widgets those LSP providers need
// (suggest, hover, parameter hints, go-to-definition, problems navigation) and
// nothing that brings its own language smarts (no TS/JSON/CSS/HTML services, no
// inline completions, no code lens, no sticky scroll, no minimap). Everything
// importing this module is reached only through LazyCodeFileView, so none of it
// lands on the warm pane path.
import type { Environment } from "monaco-editor/editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import "monaco-editor/features/anchorSelect/register";
import "monaco-editor/features/bracketMatching/register";
import "monaco-editor/features/caretOperations/register";
import "monaco-editor/features/clipboard/register";
import "monaco-editor/features/comment/register";
import "monaco-editor/features/contextmenu/register";
import "monaco-editor/features/cursorUndo/register";
import "monaco-editor/features/dnd/register";
import "monaco-editor/features/find/register";
import "monaco-editor/features/folding/register";
import "monaco-editor/features/gotoError/register";
import "monaco-editor/features/gotoLine/register";
import "monaco-editor/features/gotoSymbol/register";
import "monaco-editor/features/hover/register";
import "monaco-editor/features/indentation/register";
import "monaco-editor/features/lineSelection/register";
import "monaco-editor/features/linesOperations/register";
import "monaco-editor/features/links/register";
import "monaco-editor/features/longLinesHelper/register";
import "monaco-editor/features/multicursor/register";
import "monaco-editor/features/parameterHints/register";
import "monaco-editor/features/readOnlyMessage/register";
import "monaco-editor/features/smartSelect/register";
import "monaco-editor/features/snippet/register";
import "monaco-editor/features/suggest/register";
import "monaco-editor/features/tokenization/register";
import "monaco-editor/features/toggleTabFocusMode/register";
import "monaco-editor/features/unusualLineTerminators/register";
import "monaco-editor/features/wordOperations/register";
import "monaco-editor/features/wordPartOperations/register";

// Only the base editor worker (tokenization/diff helpers) — no language-service
// workers. Assigned once, before the first editor is created (this module's
// evaluation precedes any `editor.create` since every caller imports it).
const runtime = globalThis as { MonacoEnvironment?: Environment };
runtime.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };

// Re-exported as `export … from` (not a destructure) so the `editor` / `languages`
// TypeScript namespaces travel with the values, and `Range` shadows the DOM one.
export { editor, languages, KeyCode, KeyMod, MarkerSeverity, Range, Uri } from "monaco-editor/editor";
export type { IDisposable, IMarkdownString, IPosition, IRange } from "monaco-editor/editor";
