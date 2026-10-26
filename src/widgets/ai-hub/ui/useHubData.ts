import { useEffect, useState } from "react";
import { getHealth, getUsage, isAiConfigured } from "@/features/ai/api/aiClient";
import type { Loadable } from "./HubCards";

/** One request on mount; nothing is requested when the service is not configured. */
export function useLoaded<T>(load: () => Promise<T>): Loadable<T> {
  const [result, setResult] = useState<Loadable<T>>({ state: "loading" });
  useEffect(() => {
    if (!isAiConfigured()) return;
    let live = true;
    load().then(
      (value) => { if (live) setResult({ state: "ready", value }); },
      () => { if (live) setResult({ state: "failed" }); },
    );
    return () => { live = false; };
  }, [load]);
  return result;
}

export const useHealth = () => useLoaded(getHealth);
export const useUsage = () => useLoaded(getUsage);
