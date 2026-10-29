/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LibraryItemDialog.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Modal } from "@osionos/ui/primitives";
import { useUserStore } from "@/features/auth";
import { loadLibraryItemDetail, type LibraryItemDetail, type LibraryItemRef } from "../model/libraryItemDetail";

type DetailState = { status: "loading" } | { status: "ready"; detail: LibraryItemDetail } | { status: "missing" } | { status: "failed" };

const MUTED = "text-sm text-[var(--osio-fg-muted)]";

function useLibraryItemDetail(itemRef: LibraryItemRef): DetailState {
  const [state, setState] = React.useState<DetailState>({ status: "loading" });
  React.useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadLibraryItemDetail(itemRef, useUserStore.getState().activeWorkspace()?._id)
      .then((detail) => { if (live) setState(detail ? { status: "ready", detail } : { status: "missing" }); })
      .catch(() => { if (live) setState({ status: "failed" }); });
    return () => { live = false; };
  }, [itemRef]);
  return state;
}

const DetailBody: React.FC<{ detail: LibraryItemDetail }> = ({ detail }) => (
  <div className="space-y-3">
    <p className="text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">{detail.label}</p>
    <p className="text-sm text-[var(--osio-fg-default)]">{detail.description || "No description."}</p>
    {detail.body && (
      <section aria-label={detail.body.label} className="space-y-1">
        <p className="text-xs font-medium text-[var(--osio-fg-default)]">{detail.body.label}</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3 font-mono text-xs text-[var(--osio-fg-default)]">
          {detail.body.text}
        </pre>
      </section>
    )}
  </div>
);

/** A skill, agent or command row opened from the Library: read-only, from the AI service. */
export const LibraryItemDialog: React.FC<{ itemRef: LibraryItemRef; onClose: () => void }> = ({ itemRef, onClose }) => {
  const state = useLibraryItemDetail(itemRef);
  const title = state.status === "ready" ? state.detail.title : "Library item";
  return (
    <Modal open onClose={onClose} title={title} size="md">
      <div data-testid="library-item-dialog" className="p-4">
        <p aria-hidden className="osio-h4 pb-3 text-[var(--osio-fg-default)]">{title}</p>
        {state.status === "loading" && <p className={MUTED} role="status">Loading…</p>}
        {state.status === "ready" && <DetailBody detail={state.detail} />}
        {state.status === "missing" && <p className={MUTED} role="alert">This item no longer exists, or you can no longer see it.</p>}
        {state.status === "failed" && <p className={MUTED} role="alert">The AI service could not be reached. Try again in a moment.</p>}
      </div>
    </Modal>
  );
};
