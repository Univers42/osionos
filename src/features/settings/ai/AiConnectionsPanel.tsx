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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, KeyRound, Loader2, Plug, Server, Trash2, TriangleAlert } from "lucide-react";

import {
  completeOpenRouterOAuth,
  createConnection,
  deleteConnection,
  getUsage,
  isAiConfigured,
  listConnections,
  listProviders,
  startOpenRouterOAuth,
  testConnection,
  type AiConnection,
  type AiProvider,
  type AiUsage,
} from "@/features/ai/api/aiClient";
import { ENDPOINT_FORMAT, LOCALHOST_MESSAGE, validateApiKey, validateEndpointUrl } from "@/features/ai/model/aiConnectionForm";
import { completeOAuthReturn } from "@/features/ai/model/aiOAuthReturn";
import { PLATFORM_CONNECTION_ID } from "@/features/ai/model/aiSelection";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

/** The provider of the opencode Zen connection, when the service knows it. */
const OPENCODE_PROVIDER = "opencode";

/** The forms the "Connect" section can show. */
type ConnectForm = "none" | "openrouter" | "apikey" | "endpoint";

/** A refusal, in plain words. */
function failureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return errorWords(typeof code === "string" ? code : "network_error");
}

/** Micro dollars → dollars, with two decimals. */
function dollars(microUsd: number): string {
  return (microUsd / 1_000_000).toFixed(2);
}

const CHIP =
  "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium";

const FIELD_LABEL = "block text-xs font-medium text-[var(--osio-fg-default)]";

const FIELD_INPUT =
  "mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none transition-colors focus-visible:border-[var(--osio-accent)]";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-50";

/** The chip that says how a connection stands. */
const StatusChip: React.FC<{ connection: AiConnection }> = ({ connection }) => {
  if (connection.status === "ok") {
    return (
      <span className={`${CHIP} bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]`}>
        <Check size={11} aria-hidden /> Working
      </span>
    );
  }
  if (connection.status === "error") {
    return (
      <span className={`${CHIP} bg-[var(--osio-danger)]/12 text-[var(--osio-danger)]`}>
        <TriangleAlert size={11} aria-hidden /> {connection.statusMessage || "Not working"}
      </span>
    );
  }
  return <span className={`${CHIP} bg-[var(--osio-bg-muted)] text-[var(--osio-fg-muted)]`}>Not tested</span>;
};

/** The card of one way to connect. */
const ChoiceCard: React.FC<{
  title: string;
  hint: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, hint, action, children }) => (
  <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</div>
        <p className="mt-0.5 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{hint}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
    {children ? <div className="mt-3 space-y-3">{children}</div> : null}
  </div>
);

export const AiConnectionsPanel: React.FC = () => {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [form, setForm] = useState<ConnectForm>("none");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  // The API-key form.
  const [providerId, setProviderId] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  // The endpoint form.
  const [baseUrl, setBaseUrl] = useState("");
  const [endpointKey, setEndpointKey] = useState("");
  const [endpointLabel, setEndpointLabel] = useState("");
  const [formError, setFormError] = useState("");

  // The OAuth return is finished once, even when the effect runs twice.
  const oauthHandled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [list, usageNow] = await Promise.all([listConnections(), getUsage()]);
      setConnections(list);
      setUsage(usageNow);
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }, []);

  useEffect(() => {
    if (!isAiConfigured()) return;
    void refresh();
    void listProviders()
      .then(setProviders)
      .catch((failure) => setError(failureMessage(failure)));
  }, [refresh]);

  // The way back from OpenRouter: the code is exchanged once, then the URL is
  // cleaned so a reload does not try again.
  useEffect(() => {
    if (typeof globalThis.location === "undefined") return;
    if (oauthHandled.current) return;
    oauthHandled.current = true;
    void completeOAuthReturn({
      href: globalThis.location.href,
      complete: (code, state) => completeOpenRouterOAuth(code, state),
      replace: (url) => globalThis.history.replaceState(null, "", url),
    })
      .then((finished) => {
        if (!finished) return;
        setNotice("OpenRouter is connected.");
        void refresh();
      })
      .catch((failure) => setError(failureMessage(failure)));
  }, [refresh]);

  const platform = connections.find((connection) => connection.id === PLATFORM_CONNECTION_ID) ?? null;
  const own = connections.filter((connection) => connection.id !== PLATFORM_CONNECTION_ID);

  const filteredProviders = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter(
      (provider) =>
        provider.name.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query),
    );
  }, [providerQuery, providers]);

  const opencodeKnown = providers.some((provider) => provider.id === OPENCODE_PROVIDER);

  const openApiKeyForm = (provider?: string) => {
    setForm("apikey");
    setProviderId(provider ?? providers.find((entry) => entry.supported)?.id ?? "");
    setProviderQuery("");
    setApiKey("");
    setApiKeyLabel("");
    setFormError("");
    setError("");
  };

  const signInWithOpenRouter = async () => {
    setBusy("openrouter");
    setError("");
    try {
      const url = await startOpenRouterOAuth(globalThis.location.href);
      globalThis.location.assign(url);
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy("");
    }
  };

  const submitApiKey = async () => {
    const keyCheck = validateApiKey(apiKey);
    if (!keyCheck.ok) {
      setFormError(keyCheck.message);
      return;
    }
    if (!providerId) {
      setFormError("Choose the provider the key belongs to.");
      return;
    }
    setBusy("apikey");
    setFormError("");
    setError("");
    try {
      await createConnection({
        kind: "api_key",
        provider: providerId,
        apiKey: apiKey.trim(),
        ...(apiKeyLabel.trim() ? { label: apiKeyLabel.trim() } : {}),
      });
      // The key is gone from the browser the moment the service has it.
      setApiKey("");
      setApiKeyLabel("");
      setForm("none");
      setNotice("The connection is added.");
      await refresh();
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const submitEndpoint = async () => {
    const urlCheck = validateEndpointUrl(baseUrl);
    if (!urlCheck.ok) {
      setFormError(urlCheck.message);
      return;
    }
    setBusy("endpoint");
    setFormError("");
    setError("");
    try {
      await createConnection({
        kind: "endpoint",
        label: endpointLabel.trim() || "My endpoint",
        baseUrl: baseUrl.trim(),
        ...(endpointKey.trim() ? { apiKey: endpointKey.trim() } : {}),
      });
      setBaseUrl("");
      setEndpointKey("");
      setEndpointLabel("");
      setForm("none");
      setNotice("The connection is added.");
      await refresh();
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const runTest = async (id: string) => {
    setBusy(`test:${id}`);
    setError("");
    try {
      const tested = await testConnection(id);
      setConnections((current) =>
        current.map((connection) => (connection.id === tested.id ? tested : connection)),
      );
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const runRemove = async (id: string) => {
    setBusy(`remove:${id}`);
    setError("");
    try {
      await deleteConnection(id);
      setConnections((current) => current.filter((connection) => connection.id !== id));
      setRemoving(null);
      setNotice("The connection is removed.");
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const spent = usage ? usage.spentMicroUsd : 0;
  const limit = usage ? usage.limitMicroUsd : 0;
  const usedRatio = limit > 0 ? Math.min(1, spent / limit) : 0;

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
              {platform?.label ?? "Our key and your daily budget. No account of your own is needed."}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs text-[var(--osio-fg-muted)]">
            <span>Today&apos;s usage</span>
            <span data-testid="ai-usage-label">
              {usage ? `${dollars(spent)} of ${dollars(limit)}` : "—"}
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
                <button type="button" onClick={() => void submitApiKey()} disabled={busy === "apikey"} className={PRIMARY_BUTTON}>
                  {busy === "apikey" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Connect
                </button>
                <button type="button" onClick={() => setForm("none")} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
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
                <button type="button" onClick={() => void submitEndpoint()} disabled={busy === "endpoint"} className={PRIMARY_BUTTON}>
                  {busy === "endpoint" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Connect
                </button>
                <button type="button" onClick={() => setForm("none")} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
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

      {/* The connections the user has. */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Your connections</h4>
        {own.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">No connection of your own yet.</p>
        ) : (
          <div className="divide-y divide-[var(--osio-border-default)] rounded-lg border border-[var(--osio-border-default)]">
            {own.map((connection) => (
              <div key={connection.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{connection.label}</div>
                  <div className="truncate text-xs text-[var(--osio-fg-muted)]">
                    {connection.provider}
                    {connection.last4 ? ` · ···· ${connection.last4}` : ""}
                    {connection.baseUrl ? ` · ${connection.baseUrl}` : ""}
                  </div>
                </div>
                <StatusChip connection={connection} />
                {removing === connection.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[var(--osio-fg-muted)]">Remove this connection?</span>
                    <button
                      type="button"
                      onClick={() => void runRemove(connection.id)}
                      disabled={busy === `remove:${connection.id}`}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50"
                    >
                      {busy === `remove:${connection.id}` ? "Removing…" : "Remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(null)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runTest(connection.id)}
                      disabled={busy === `test:${connection.id}`}
                      className="rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-50"
                    >
                      {busy === `test:${connection.id}` ? "Testing…" : "Test"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(connection.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)]"
                    >
                      <Trash2 size={12} aria-hidden /> Remove
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
