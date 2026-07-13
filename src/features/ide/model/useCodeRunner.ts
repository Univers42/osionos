/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCodeRunner.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useRef, useState } from "react";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { parseSseBlock } from "@/shared/agent/useAgentStream";

export interface RunLine {
  stream: "stdout" | "stderr" | "system";
  text: string;
}
export interface RunExit {
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Client for the sandboxed code runner (POST /api/ide/run, SSE). Sends the app
 * session JWT (the bridge authenticates every run); streams stdout/stderr into
 * `lines` and the final `exit` into `exit`. Reuses `parseSseBlock` (library-first)
 * and the same `API_BASE` transport as the api client. The runner's stdout is a
 * pipe (not a TTY) so tools emit no ANSI colour — raw text renders cleanly.
 *
 * Double-gate aware: a 404 means the server has no runner configured
 * (OSIONOS_RUNNER_URL unset) — surfaced as a plain message, never a crash.
 */
export function useCodeRunner() {
  const [lines, setLines] = useState<RunLine[]>([]);
  const [running, setRunning] = useState(false);
  const [exit, setExit] = useState<RunExit | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => { setLines([]); setExit(null); }, []);
  const stop = useCallback(() => { abortRef.current?.abort(); setRunning(false); }, []);

  const run = useCallback(async (language: string, source: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLines([{ stream: "system", text: `$ run · ${language}` }]);
    setExit(null);
    setRunning(true);

    const append = (line: RunLine) => setLines((prev) => [...prev, line]);
    const jwt = getActivePageJwt();
    if (!API_BASE || !jwt) {
      append({ stream: "stderr", text: "Cannot run — not signed in or bridge not configured." });
      setRunning(false);
      return;
    }
    const handle = (parsed: ReturnType<typeof parseSseBlock>) => {
      if (!parsed) return;
      const data = parsed.data as unknown as { chunk?: string; message?: string } & Partial<RunExit>;
      if (parsed.event === "stdout" || parsed.event === "stderr") append({ stream: parsed.event, text: String(data.chunk ?? "") });
      else if (parsed.event === "exit") setExit({ code: data.code ?? null, signal: data.signal ?? null, timedOut: Boolean(data.timedOut), durationMs: data.durationMs ?? 0 });
      else if (parsed.event === "error") append({ stream: "stderr", text: String(data.message ?? "runner error") });
    };

    try {
      const res = await fetch(`${API_BASE}/api/ide/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ language, source }),
        signal: controller.signal,
      });
      if (res.status === 404) { append({ stream: "stderr", text: "Code runner is not enabled on the server (OSIONOS_RUNNER_URL unset)." }); return; }
      if (!res.ok || !res.body) { append({ stream: "stderr", text: `Runner error (${res.status}).` }); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) handle(parseSseBlock(block));
      }
      handle(parseSseBlock(buffer));
    } catch (error) {
      if (!controller.signal.aborted) append({ stream: "stderr", text: `Run failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setRunning(false);
    }
  }, []);

  return { lines, running, exit, run, clear, stop };
}
