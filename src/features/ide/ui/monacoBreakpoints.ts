/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoBreakpoints.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { editor, KeyCode, Range } from "../model/monacoRuntime";
import { useDebugStore } from "../model/debugStore";
import { gutterMarks, isPythonPath, workspacePathOfUri } from "../model/debugGutter";
import { debugFile } from "../model/ideTasks";

// Ponytail: breakpoints are stored as line numbers, so inserting lines above
// one leaves it pointing at the old line number instead of tracking the text.
/** Gutter breakpoints + the stopped line for one Python editor: glyph-margin
 *  dots from the debug store, click-to-toggle, F5 to debug. O(b) per render
 *  in this file's breakpoint lines; the F5 command dies with the editor. */
export function attachBreakpoints(instance: editor.IStandaloneCodeEditor, uri: string): () => void {
  const path = workspacePathOfUri(uri);
  if (path === null || !isPythonPath(path)) return () => undefined;
  instance.updateOptions({ glyphMargin: true });
  const collection = instance.createDecorationsCollection();
  const render = (): void => {
    const state = useDebugStore.getState();
    const marks = gutterMarks(path, { breakpoints: state.breakpoints, status: state.status, frames: state.frames });
    collection.set(marks.map((mark) => (
      mark.kind === "breakpoint"
        ? { range: new Range(mark.line, 1, mark.line, 1), options: { glyphMarginClassName: "osio-breakpoint" } }
        : { range: new Range(mark.line, 1, mark.line, 1), options: { isWholeLine: true, className: "osio-debug-line", glyphMarginClassName: "osio-debug-current" } }
    )));
  };
  render();
  const unsubscribe = useDebugStore.subscribe(render);
  const mouse = instance.onMouseDown((event) => {
    if (event.target.type !== editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const line = event.target.position?.lineNumber;
    if (typeof line === "number") useDebugStore.getState().toggleBreakpoint(path, line);
  });
  instance.addCommand(KeyCode.F5, () => { void debugFile(path, instance.getValue()); });
  return () => {
    unsubscribe();
    mouse.dispose();
    collection.clear();
  };
}
