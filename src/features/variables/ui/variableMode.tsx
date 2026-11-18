/**
 * Whose `{{…}}` a read-only surface may resolve. `resolve` reads the open page's scope;
 * `literal` shows the source text and reads nothing. A profile README is someone else's
 * text, so it renders `literal`: the viewer's values never reach it (groot ADR 0059).
 * The default is `resolve` because every other surface (own pages, previews)
 * relies on it; only a subtree that mounts a provider changes mode.
 */

import React, { createContext, useContext } from "react";

import { renderVariableChip, resolveVariableInActivePage } from "./VariableChip";

export type VariableMode = "resolve" | "literal";

const VariableModeContext = createContext<VariableMode>("resolve");

export const VariableModeProvider: React.FC<{ mode: VariableMode; children: React.ReactNode }> = ({ mode, children }) => (
  <VariableModeContext.Provider value={mode}>{children}</VariableModeContext.Provider>
);

export const useVariableMode = (): VariableMode => useContext(VariableModeContext);

/** The engine's React hook; absent, the engine prints the source text. */
export const variableRendererFor = (mode: VariableMode) => (mode === "resolve" ? renderVariableChip : undefined);

/** The engine's string-path hook; absent, the engine prints the escaped source text. */
export const variableResolverFor = (mode: VariableMode) => (mode === "resolve" ? resolveVariableInActivePage : undefined);
