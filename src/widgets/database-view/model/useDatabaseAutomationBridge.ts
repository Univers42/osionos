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
import { AUTOMATION_FIRED_EVENT, setAutomationWebhookTransport } from '@notion-db/object-database';
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
