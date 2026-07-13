/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDatabaseAutomationBridge.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ─── Database automations ↔ app bridge ──────────────────────────────────────
// The database engine is host-agnostic: notify actions dispatch a window
// CustomEvent and webhooks go through a registered transport. This hook (one
// mount, App.tsx) wires both to app services — toasts for notify, the
// SSRF-guarded bridge endpoint for webhooks. Offline builds (no API_BASE)
// leave the transport unset so the engine's warn fallback applies.

import { useEffect } from 'react';
// Deep imports, deliberately: this hook mounts once in App (warm path), and the
// @notion-db/object-database BARREL carries a side-effect CSS import + the full
// ObjectDatabase module eval — the exact barrel-leak class the lazy-view rule
// exists for. Both symbols live in side-effect-free leaf modules.
import { AUTOMATION_FIRED_EVENT } from '@/shared/notion-database-sys/src/lib/automations/automationRunner';
import { setAutomationWebhookTransport } from '@/shared/notion-database-sys/src/lib/automations/webhookTransport';
import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { api, API_BASE, getActivePageJwt } from '@/shared/api/client';

interface AutomationFiredDetail {
  ruleId?: string;
  ruleName?: string;
  message?: string;
}

export function useDatabaseAutomationBridge(): void {
  useEffect(() => {
    const onFired = (event: Event) => {
      const detail = (event as CustomEvent<AutomationFiredDetail>).detail ?? {};
      useToastStore.getState().push({
        kind: 'info',
        title: detail.ruleName ?? 'Automation',
        description: detail.message,
      });
    };
    window.addEventListener(AUTOMATION_FIRED_EVENT, onFired);

    if (API_BASE) {
      setAutomationWebhookTransport(async (url, payload) => {
        await api.post('/api/automations/webhook', { url, payload }, getActivePageJwt() ?? undefined);
      });
    }
    return () => {
      window.removeEventListener(AUTOMATION_FIRED_EVENT, onFired);
      setAutomationWebhookTransport(null);
    };
  }, []);
}
