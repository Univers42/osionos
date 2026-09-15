/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToastViewport.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { useToastStore, type Toast } from "./useToastStore";

const ICONS: Record<Toast["kind"], React.ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <XCircle size={17} />,
  info: <Info size={17} />,
  warning: <AlertTriangle size={17} />,
};

const TONE_CLASS: Record<Toast["kind"], string> = {
  success: "text-[var(--osio-accent)]",
  error: "text-[var(--osio-danger)]",
  info: "text-[var(--osio-fg-muted)]",
  warning: "text-[var(--osio-warning)]",
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const duration = toast.durationMs === undefined ? 4000 : toast.durationMs;
    if (duration === null) return undefined;
    const timer = globalThis.setTimeout(() => dismiss(toast.id), duration);
    return () => globalThis.clearTimeout(timer);
  }, [dismiss, toast.durationMs, toast.id]);

  return (
    <li
      className="flex w-[min(360px,calc(100vw-32px))] animate-[toast-in_var(--osio-dur-slow)_var(--osio-ease-emphasized)] items-start gap-3 rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3 text-[var(--osio-fg-default)] shadow-[var(--osio-e3)]"
    >
      <span className={`mt-0.5 shrink-0 ${TONE_CLASS[toast.kind]}`}>{ICONS[toast.kind]}</span>
      {/* role=status lives INSIDE the li — a role on the li itself breaks the
          ol/li list semantics (Lighthouse list + aria-allowed-role). */}
      <div className="min-w-0 flex-1" role="status" aria-live={toast.kind === "error" ? "assertive" : "polite"}>
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description ? <p className="mt-1 text-sm leading-5 text-[var(--osio-fg-muted)]">{toast.description}</p> : null}
        {toast.action ? (
          <button
            type="button"
            className="mt-2 rounded px-0 text-sm font-medium text-[var(--osio-accent)] hover:underline"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="rounded-[var(--osio-radius-chip)] p-1 text-[var(--osio-fg-subtle)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </li>
  );
};

export const ToastViewport: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <ol className="fixed bottom-4 right-4 z-[calc(var(--osio-z-modal)+1)] flex flex-col-reverse gap-2">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
    </ol>
  );
};
