/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineWindowCard.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One machine's card on /machine: it opens the IDE origin as its own window and answers that
// window's session requests through linkMachineFrame. Not a frame: the app and a machine are two
// sites, and a cross-site frame never gets its SameSite=Strict cookie (C0-F1, tests/machine).
// The window keeps its opener so the session can reach it; a popup needs the click itself, so
// nothing here opens a window on its own.

import React, { useEffect, useRef, useState } from "react";

import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";

import { linkMachineFrame, type MachineIdentity, type MachineViewState, type MintResult } from "../machineLink";

const MESSAGE: Partial<Record<MachineViewState, string>> = {
  "step-up": "Confirm it is you to open this machine.",
  unavailable: "This machine cannot be opened from this account.",
  mismatch: "The program answering on this machine's port is not this machine. Stop it, start osionos-node on the machine, then open it again.",
  error: "The machine is not reachable, or the window was blocked. Check that osionos-node is running on it.",
};

const STATUS: Partial<Record<MachineViewState, string>> = {
  connecting: "Ready to open.",
  connected: "Open in its own window.",
  reconnecting: "Reconnecting…",
};

export type MachineWindowProps = {
  label: string;
  title: string;
  subtitle: string;
  ideOrigin: string;
  windowUrl: string;
  windowName: string;
  mint: () => Promise<MintResult>;
  identity?: MachineIdentity;
};

export function MachineWindowCard({ label, title, subtitle, ideOrigin, windowUrl, windowName, mint, identity }: MachineWindowProps) {
  const grants = useSudoPromptStore((state) => state.grants);
  const windowRef = useRef<Window | null>(null);
  const linkRef = useRef<ReturnType<typeof linkMachineFrame> | null>(null);
  const stateRef = useRef<MachineViewState>("connecting");
  // The link lives as long as the window's address and machine; the latest mint is read through a
  // ref (the legacy one changes once the workspace loads) so a re-render does not drop a pending hello.
  const mintRef = useRef(mint);
  const identityRef = useRef(identity);
  useEffect(() => {
    mintRef.current = mint;
    identityRef.current = identity;
  });
  const [opened, setOpened] = useState(false);
  const [state, setState] = useState<MachineViewState>("connecting");
  const machineId = identity?.machineId ?? null;

  useEffect(() => {
    const link = linkMachineFrame({
      frame: () => windowRef.current,
      ideOrigin,
      listen: (handler) => {
        const onMessage = (event: MessageEvent) => handler(event);
        globalThis.addEventListener("message", onMessage);
        return () => globalThis.removeEventListener("message", onMessage);
      },
      mint: () => mintRef.current(),
      onState: (next) => {
        stateRef.current = next;
        setState(next);
      },
      identity: identityRef.current,
    });
    linkRef.current = link;
    return link.stop;
  }, [ideOrigin, windowUrl, machineId]);

  // A granted step-up retries once, the way the settings panels do.
  useEffect(() => {
    if (grants > 0 && stateRef.current === "step-up") void linkRef.current?.retry();
  }, [grants]);

  const open = () => {
    windowRef.current = globalThis.open(windowUrl, windowName);
    if (!windowRef.current) setState("error");
    setOpened(Boolean(windowRef.current));
  };

  return (
    <section className="w-full max-w-md rounded-md border border-[var(--osio-border)] bg-[var(--osio-bg-panel)] p-6 shadow-osio-e1">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">{label}</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-1 truncate text-sm text-[var(--osio-fg-muted)]" title={subtitle}>{subtitle}</p>
      <p role="status" className="mt-4 text-sm">{MESSAGE[state] ?? STATUS[state] ?? ""}</p>
      <button
        type="button"
        className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
        onClick={open}
      >
        {opened ? "Show the window" : "Open in a new window"}
      </button>
    </section>
  );
}
