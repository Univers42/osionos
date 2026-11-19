/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawSourcePane.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Raw mode's code pane: the textarea, or with Advanced on the Monaco console once its chunk
// has loaded (ADR 0064 PS22). The chunk is fetched by import() on the first toggle only; a
// failed fetch goes through the preload recovery (ADR 0061) like every lazy chunk, and if the
// page is not reloaded the textarea stays, so the text being edited is never lost. Both panes
// open on the live text, so the swap keeps every edit.
import React, { useEffect, useState } from "react";
import type { RawMonacoPane as MonacoPane } from "./RawMonacoPane";
import { RawCodePane } from "./RawCodePane";

interface RawSourcePaneProps {
  isAdvanced: boolean;
  readSource: () => string;
  onChange: (next: string) => void;
  /** The debounced text the preview shows. */
  checkSource: string;
  showLineNumbers: boolean;
}

interface Loaded {
  Pane: typeof MonacoPane | null;
  hasFailed: boolean;
}

let loading: Promise<typeof MonacoPane> | null = null;

function loadMonacoPane(): Promise<typeof MonacoPane> {
  loading ??= import("./RawMonacoPane").then((module) => module.RawMonacoPane);
  loading.catch(() => { loading = null; });
  return loading;
}

function useMonacoPane(isWanted: boolean): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ Pane: null, hasFailed: false });
  useEffect(() => {
    if (!isWanted || loaded.Pane !== null) return;
    let isLive = true;
    loadMonacoPane().then(
      (Pane) => { if (isLive) setLoaded({ Pane, hasFailed: false }); },
      () => { if (isLive) setLoaded({ Pane: null, hasFailed: true }); },
    );
    return () => { isLive = false; };
  }, [isWanted, loaded.Pane]);
  return loaded;
}

export function RawSourcePane({ isAdvanced, readSource, onChange, checkSource, showLineNumbers }: Readonly<RawSourcePaneProps>) {
  const { Pane, hasFailed } = useMonacoPane(isAdvanced);
  const plain = <RawCodePane readSource={readSource} onChange={onChange} showLineNumbers={showLineNumbers} />;
  if (!isAdvanced) return plain;
  if (Pane !== null) return <Pane readSource={readSource} onChange={onChange} checkSource={checkSource} showLineNumbers={showLineNumbers} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p role="status" className="border-b border-[var(--osio-border-default)] px-3 py-1 text-xs text-[var(--osio-fg-muted)]">
        {hasFailed ? "The Advanced console did not load: the plain editor stays. Toggle Advanced to retry." : "Loading the Advanced console…"}
      </p>
      <div className="min-h-0 flex-1">{plain}</div>
    </div>
  );
}
