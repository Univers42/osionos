/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAiConnections.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The state and the calls of the AI connections panel. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { validateApiKey, validateEndpointUrl } from "@/features/ai/model/aiConnectionForm";
import { completeOAuthReturn } from "@/features/ai/model/aiOAuthReturn";
import { PLATFORM_CONNECTION_ID } from "@/features/ai/model/aiSelection";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

/** The provider of the opencode Zen connection, when the service knows it. */
export const OPENCODE_PROVIDER = "opencode";

/** The forms the "Connect" section can show. */
export type ConnectForm = "none" | "openrouter" | "apikey" | "endpoint";

/** A refusal, in plain words. */
function failureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return errorWords(typeof code === "string" ? code : "network_error");
}

export function useAiConnections() {
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

  return {
    connections, usage, form, setForm, busy, error, setError, notice, removing, setRemoving,
    providerId, setProviderId, providerQuery, setProviderQuery, apiKey, setApiKey,
    apiKeyLabel, setApiKeyLabel, baseUrl, setBaseUrl, endpointKey, setEndpointKey,
    endpointLabel, setEndpointLabel, formError, setFormError, own, filteredProviders,
    opencodeKnown, openApiKeyForm, signInWithOpenRouter, submitApiKey, submitEndpoint,
    runTest, runRemove, spent, limit, usedRatio,
  };
}
