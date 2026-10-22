/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiConnectionForms.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Loader2 } from "lucide-react";

import type { AiProvider } from "@/features/ai/api/aiClient";
import { ENDPOINT_FORMAT, LOCALHOST_MESSAGE } from "@/features/ai/model/aiConnectionForm";
import { FIELD_INPUT, FIELD_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./aiPanelClasses";

/** The form that connects a provider with its API key. */
export const ApiKeyForm: React.FC<{
  providerQuery: string;
  setProviderQuery: (value: string) => void;
  providerId: string;
  setProviderId: (value: string) => void;
  filteredProviders: AiProvider[];
  apiKey: string;
  setApiKey: (value: string) => void;
  apiKeyLabel: string;
  setApiKeyLabel: (value: string) => void;
  formError: string;
  busy: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({
  providerQuery, setProviderQuery, providerId, setProviderId, filteredProviders,
  apiKey, setApiKey, apiKeyLabel, setApiKeyLabel, formError, busy, onSubmit, onCancel,
}) => (
            <div className="space-y-3">
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-provider-search">Search providers</label>
                <input
                  id="ai-provider-search"
                  type="search"
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder="OpenAI, Anthropic, Google…"
                  className={FIELD_INPUT}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-provider">Provider</label>
                <select
                  id="ai-provider"
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                  className={FIELD_INPUT}
                >
                  <option value="">Choose a provider…</option>
                  {filteredProviders.map((provider) => (
                    <option key={provider.id} value={provider.id} disabled={!provider.supported}>
                      {provider.name}
                      {provider.supported ? "" : " — not supported yet"}
                    </option>
                  ))}
                </select>
                {filteredProviders.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">No provider matches that search.</p>
                ) : null}
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-api-key">API key</label>
                <input
                  id="ai-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-…"
                  className={FIELD_INPUT}
                />
                <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
                  The key is sent to our server and kept there. It never comes back.
                </p>
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-api-key-label">Label (optional)</label>
                <input
                  id="ai-api-key-label"
                  type="text"
                  value={apiKeyLabel}
                  onChange={(event) => setApiKeyLabel(event.target.value)}
                  placeholder="Work key"
                  className={FIELD_INPUT}
                />
              </div>
              {formError ? <p className="text-xs text-[var(--osio-danger)]">{formError}</p> : null}
              <div className="flex gap-2">
                <button type="button" onClick={() => onSubmit()} disabled={busy === "apikey"} className={PRIMARY_BUTTON}>
                  {busy === "apikey" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Connect
                </button>
                <button type="button" onClick={() => onCancel()} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
);

/** The form that connects an endpoint of the user's own. */
export const EndpointForm: React.FC<{
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  endpointKey: string;
  setEndpointKey: (value: string) => void;
  endpointLabel: string;
  setEndpointLabel: (value: string) => void;
  formError: string;
  busy: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({
  baseUrl, setBaseUrl, endpointKey, setEndpointKey, endpointLabel, setEndpointLabel,
  formError, busy, onSubmit, onCancel,
}) => (
            <div className="space-y-3">
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-endpoint-url">Base URL</label>
                <input
                  id="ai-endpoint-url"
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={ENDPOINT_FORMAT}
                  className={FIELD_INPUT}
                />
                <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
                  Write the base URL as <code className="font-mono">{ENDPOINT_FORMAT}</code>.
                </p>
                <p className="mt-1 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{LOCALHOST_MESSAGE}</p>
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-endpoint-key">API key (optional)</label>
                <input
                  id="ai-endpoint-key"
                  type="password"
                  autoComplete="off"
                  value={endpointKey}
                  onChange={(event) => setEndpointKey(event.target.value)}
                  placeholder="Only if your server asks for one"
                  className={FIELD_INPUT}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="ai-endpoint-label">Label (optional)</label>
                <input
                  id="ai-endpoint-label"
                  type="text"
                  value={endpointLabel}
                  onChange={(event) => setEndpointLabel(event.target.value)}
                  placeholder="My Ollama"
                  className={FIELD_INPUT}
                />
              </div>
              {formError ? <p className="text-xs text-[var(--osio-danger)]">{formError}</p> : null}
              <div className="flex gap-2">
                <button type="button" onClick={() => onSubmit()} disabled={busy === "endpoint"} className={PRIMARY_BUTTON}>
                  {busy === "endpoint" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Connect
                </button>
                <button type="button" onClick={() => onCancel()} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
);
