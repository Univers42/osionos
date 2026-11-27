/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SessionGateScreens.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { LegalLinks } from "@/features/legal/ui/LegalLinks";
import { PRISMATICA_URL } from "@/features/auth/model/userStore.helpers";

/** The splash while the accounts sign in. */
export function SigningInScreen() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-[var(--osio-bg-page)]">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
        <p className="text-sm text-[var(--osio-fg-muted)]">Signing in...</p>
      </div>
    </div>
  );
}

/** Shown when no signed workspace handoff exists: the app only opens from Prismatica. */
export function PrivateWorkspaceScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--osio-bg-page)] px-6 text-[var(--osio-fg-default)]">
      <section className="w-full max-w-md rounded-md border border-[var(--osio-border)] bg-[var(--osio-bg-panel)] p-6 shadow-osio-e1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">Private workspace</p>
        <h1 className="mt-3 text-2xl font-semibold">Open osionos from Prismatica</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--osio-fg-muted)]">
          This app only opens after your Prismatica account creates a signed workspace handoff.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
          onClick={() => { globalThis.location.href = PRISMATICA_URL; }}
        >
          Go to Prismatica
        </button>
        <LegalLinks className="mt-4 justify-center" />
      </section>
    </div>
  );
}
