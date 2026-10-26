/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVisibleWhen.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import {
  compileFormula,
  evaluateHandle,
  getDependencies,
  initFormulaEngine,
  isWasmReady,
} from "@/shared/notion-database-sys/src/lib/engine/bridge";
import { visibleForSnapshot } from "@/entities/block/model/visibility";
import { useVisibilityScope } from "@/entities/block/model/visibilityScope";

const EMPTY_PROPS: Record<string, unknown> = {};
const NO_SCOPE_SUBSCRIBE = (): (() => void) => () => {};
const NO_SCOPE_SNAPSHOT = EMPTY_PROPS;

/**
 * Returns whether a block carrying `visibleWhen` should be shown. Fails open
 * (visible) when there is no formula, no scope, or the engine is unavailable.
 */
export function useVisibleWhen(formula: string | undefined): boolean {
  const scope = useVisibilityScope();
  const source = formula?.trim() ?? "";

  const [engineReady, setEngineReady] = useState<boolean>(() => isWasmReady());
  useEffect(() => {
    if (engineReady) return;
    let alive = true;
    void initFormulaEngine().then(() => {
      if (alive) setEngineReady(true);
    });
    return () => {
      alive = false;
    };
  }, [engineReady]);

  const handle = useMemo(() => {
    if (!source || !engineReady) return null;
    return compileFormula(source);
  }, [source, engineReady]);

  const handleNumber = handle && handle.ok && typeof handle.handle === "number" ? handle.handle : undefined;

  const deps = useMemo<string[]>(() => {
    if (handleNumber === undefined) return [];
    return getDependencies(handleNumber);
  }, [handleNumber]);

  const snapshot = useSyncExternalStore(
    scope ? scope.subscribe : NO_SCOPE_SUBSCRIBE,
    () => (scope ? scope.read(deps) : NO_SCOPE_SNAPSHOT),
    () => (scope ? scope.read(deps) : NO_SCOPE_SNAPSHOT),
  );

  if (!source || !scope || !engineReady || handleNumber === undefined) return true;

  const visible = visibleForSnapshot(
    scope,
    source,
    snapshot,
    (props) => evaluateHandle(handleNumber, props),
  );

  return visible;
}