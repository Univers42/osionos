/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SandboxUnavailable.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ServerOff } from "lucide-react";
import { Button } from "@/shared/ui";

import { useSandboxHealthStore, type SandboxHealthState } from "../model/sandboxHealthStore";
import { HEALTH_REASONS } from "../model/sandboxHealthCore";
import { CODE_BUTTON, StateBlock } from "./ExplorerStates";

const TITLES: Readonly<Partial<Record<SandboxHealthState, string>>> = {
  unavailable: "Sandbox unavailable",
  disabled: "Sandbox disabled",
  stopped: "Sandbox stopped",
};

// Only when the IDE backend cannot be reached: a full box cap or a refused start is not fixed by
// starting docker-ide, and showing it for every "unavailable" sent people the wrong way (2026-10-14).
const ADMIN_HINT = "An administrator must start the docker-ide service on the host.";

interface Props {
  /** One-line variant for inside panels. */
  compact?: boolean;
  /** Called with the health the Retry settled on, e.g. so the terminal can redial. */
  onRetried?: (state: SandboxHealthState) => void;
}

/** The single "sandbox is down" state every IDE part shows instead of retrying
 *  on its own. Renders nothing while the sandbox is online or not yet probed. */
export const SandboxUnavailable: React.FC<Props> = ({ compact = false, onRetried }) => {
  const state = useSandboxHealthStore((s) => s.state);
  const reason = useSandboxHealthStore((s) => s.reason);
  const retry = useSandboxHealthStore((s) => s.retry);
  const [pending, setPending] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const title = TITLES[state];
  if (!title) return null;

  const onRetry = async () => {
    setPending(true);
    try {
      const next = await retry();
      onRetried?.(next);
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const retryButton = (
    <Button size="sm" className={CODE_BUTTON} disabled={pending} aria-busy={pending} onClick={() => void onRetry()}>
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );

  if (compact) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1 text-2xs text-[var(--osio-code-fg-muted)]">
        <ServerOff size={14} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={reason ?? undefined}>
          <span className="font-semibold text-[var(--osio-code-fg)]">{title}</span>
          {reason ? ` — ${reason}` : ""}
        </span>
        <span className="shrink-0">{retryButton}</span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex h-full w-full items-center justify-center overflow-auto bg-[var(--osio-code-bg)]">
      <StateBlock icon={ServerOff} title={title} tone="code" actions={retryButton}>
        {reason && <p>{reason}</p>}
        {reason === HEALTH_REASONS.unreachable && <p>{ADMIN_HINT}</p>}
      </StateBlock>
    </div>
  );
};
