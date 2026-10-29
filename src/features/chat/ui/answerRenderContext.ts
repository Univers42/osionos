/**
 * What the code blocks of an answer need to know about the answer.
 *
 * The markdown engine calls the code renderer with the fence only, so the
 * state of the answer travels by context. The default is the SAFE one: an
 * answer not known to be complete, and no drawer — a surface that does not
 * opt in (the dock) shows a mermaid fence as code, never as a diagram.
 */

import React from "react";

export interface AnswerRenderState {
  /** True once the answer is finished: only then a diagram is drawn. */
  complete: boolean;
  /** Draws the LOCKED mermaid source. Absent: the fence stays code. */
  drawDiagram?: (source: string) => React.ReactNode;
}

export const AnswerRenderContext = React.createContext<AnswerRenderState>({ complete: false });
