/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiConnectionsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI connections — how the user brings their own model access.
 *
 * The secrets stay on the server: the browser sends a key once, in the body of
 * a request, and the service answers with the last four characters. Nothing
 * here writes a key down, and nothing here shows the price of anybody's model
 * but ours.
 *
 * The panel is the ONE place that connects a model. The chat's own connector
 * chips point here.
 */

import React from "react";
import { KeyRound, Loader2, Plug, Server } from "lucide-react";

import { isAiConfigured } from "@/features/ai/api/aiClient";
import { formatUsage } from "@/features/settings/ai/aiUsageFormat";
import { ChoiceCard } from "./aiConnectionControls";
import { ApiKeyForm, EndpointForm } from "./aiConnectionForms";
import { ConnectionList } from "./aiConnectionList";
import { CHIP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./aiPanelClasses";
import { OPENCODE_PROVIDER, useAiConnections } from "./useAiConnections";

export const AiConnectionsPanel: React.FC = () => {
  const {
    usage, form, setForm, busy, error, setError, notice, removing, setRemoving,
    providerId, setProviderId, providerQuery, setProviderQuery, apiKey, setApiKey,
    apiKeyLabel, setApiKeyLabel, baseUrl, setBaseUrl, endpointKey, setEndpointKey,
    endpointLabel, setEndpointLabel, formError, setFormError, own, filteredProviders,
    opencodeKnown, openApiKeyForm, signInWithOpenRouter, submitApiKey, submitEndpoint,
    runTest, runRemove, spent, limit, usedRatio,
  } = useAiConnections();

  if (!isAiConfigured()) {
    return (
      <section className="space-y-4" data-settings-anchor="ai-connections" data-testid="ai-connections-panel">
        <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-sm text-[var(--osio-fg-muted)]">
          The AI service is not configured in this build, so there is nothing to connect yet.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5" data-settings-anchor="ai-connections" data-testid="ai-connections-panel">
      {/* The platform connection: ours, and the usage of OUR budget only. */}
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--osio-fg-default)]">Platform connection</span>
              <span className={`${CHIP} bg-[var(--osio-accent)]/12 text-[var(--osio-accent-text)]`}>Included</span>
            </div>
            <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">
              Daily allowance on our key. No account of your own is needed.
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs text-[var(--osio-fg-muted)]">
            <span>Today&apos;s usage</span>
            <span data-testid="ai-usage-label">
              {usage ? formatUsage(spent, limit) : "—"}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Today's usage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedRatio * 100)}
            className="h-1.5 w-full overflow-hidden rounded-xs bg-[var(--osio-bg-muted)]"
          >
            <div
              className="h-full rounded-xs bg-[var(--osio-accent)]"
              style={{ width: `${Math.round(usedRatio * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" data-testid="ai-connections-error" className="text-sm text-[var(--osio-danger)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-testid="ai-connections-notice" className="text-sm text-[var(--osio-fg-muted)]">
          {notice}
        </p>
      ) : null}

      {/* The ways to connect. */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Connect your own model</h4>

        <ChoiceCard
          title="OpenRouter (sign in)"
          hint="Sign in with OpenRouter — no key to copy. The credential stays on our server."
          action={
            <button
              type="button"
              onClick={() => void signInWithOpenRouter()}
              disabled={busy === "openrouter"}
              className={PRIMARY_BUTTON}
            >
              {busy === "openrouter" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plug size={14} aria-hidden />}
              Sign in
            </button>
          }
        />

        <ChoiceCard
          title="API key"
          hint="Paste the key your provider gave you. It goes straight to our server and comes back as four dots."
          action={
            <button
              type="button"
              onClick={() => openApiKeyForm()}
              className={SECONDARY_BUTTON}
            >
              <KeyRound size={14} aria-hidden /> Use a key
            </button>
          }
        >
          {form === "apikey" ? (
            <ApiKeyForm
              providerQuery={providerQuery}
              setProviderQuery={setProviderQuery}
              providerId={providerId}
              setProviderId={setProviderId}
              filteredProviders={filteredProviders}
              apiKey={apiKey}
              setApiKey={setApiKey}
              apiKeyLabel={apiKeyLabel}
              setApiKeyLabel={setApiKeyLabel}
              formError={formError}
              busy={busy}
              onSubmit={() => void submitApiKey()}
              onCancel={() => setForm("none")}
            />
          ) : null}
        </ChoiceCard>

        {opencodeKnown ? (
          <ChoiceCard
            title="opencode Zen"
            hint="An API-key connection with the opencode provider preselected."
            action={
              <button type="button" onClick={() => openApiKeyForm(OPENCODE_PROVIDER)} className={SECONDARY_BUTTON}>
                <KeyRound size={14} aria-hidden /> Use a key
              </button>
            }
          />
        ) : null}

        <ChoiceCard
          title="Your own endpoint"
          hint="Ollama, llama.cpp, LM Studio, vLLM — any server that speaks the OpenAI format."
          action={
            <button type="button" onClick={() => { setForm("endpoint"); setFormError(""); setError(""); }} className={SECONDARY_BUTTON}>
              <Server size={14} aria-hidden /> Use an endpoint
            </button>
          }
        >
          {form === "endpoint" ? (
            <EndpointForm
              baseUrl={baseUrl}
              setBaseUrl={setBaseUrl}
              endpointKey={endpointKey}
              setEndpointKey={setEndpointKey}
              endpointLabel={endpointLabel}
              setEndpointLabel={setEndpointLabel}
              formError={formError}
              busy={busy}
              onSubmit={() => void submitEndpoint()}
              onCancel={() => setForm("none")}
            />
          ) : null}
        </ChoiceCard>

        {/* The subscriptions: not ours to offer, and not ours to promise. */}
        <div className="rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled
              title="Desktop app — coming soon"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              ChatGPT Plus/Pro
            </button>
            <button
              type="button"
              disabled
              title="Desktop app — coming soon"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              GitHub Copilot
            </button>
            <span className="text-xs text-[var(--osio-fg-subtle)]">Desktop app — coming soon</span>
          </div>
          <p className="mt-2 text-xs leading-[16px] text-[var(--osio-fg-subtle)]">
            Claude Pro/Max subscriptions can&apos;t be used by third-party apps; use an Anthropic API key or OpenRouter.
          </p>
        </div>
      </div>

      <ConnectionList
        own={own}
        removing={removing}
        setRemoving={setRemoving}
        busy={busy}
        runTest={runTest}
        runRemove={runRemove}
      />
    </section>
  );
};
