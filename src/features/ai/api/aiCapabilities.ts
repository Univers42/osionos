/**
 * The AI service's flag-gated features (services/osionos-ai/src/routes/capabilities.ts).
 *
 * Off, a feature's paths answer the router's 404, and Chrome logs every 404 as a console error
 * (#293). The transport asks GET /api/ai/capabilities once per session and answers an off
 * feature's request with that same 404 itself, so every caller that reads a 404 as "off"
 * (AccessTokensPanel, webSettings, agentForm, McpServersSection) keeps working unchanged.
 *
 * Caveat: the table mirrors services/osionos-ai/src/routes/table.ts by hand; a gated path missing
 * here still works and logs its 404 as before. A service older than the capabilities route
 * cannot say (null), so every request goes through as before, and that read logs its own 404
 * once per session.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AiCapability = "accessTokens" | "mcpServers" | "customAgents" | "web" | "threadAnswers";

export const AI_CAPABILITY_NAMES: readonly AiCapability[] = ["accessTokens", "mcpServers", "customAgents", "web", "threadAnswers"];

const GATED: readonly { capability: AiCapability; pattern: RegExp; methods?: readonly string[] }[] = [
  { capability: "accessTokens", pattern: /^\/access-tokens(\/[^/]+)?$/ },
  { capability: "mcpServers", pattern: /^\/mcp-servers(\/.*)?$/ },
  { capability: "customAgents", pattern: /^\/workspaces\/[^/]+\/agents\/settings$/ },
  { capability: "customAgents", pattern: /^\/agents\/[^/]+$/ },
  // GET /agents (the list) is always served; creating one is the flag's.
  { capability: "customAgents", pattern: /^\/agents$/, methods: ["POST"] },
  { capability: "web", pattern: /^\/workspaces\/[^/]+\/web\/settings$/ },
  { capability: "threadAnswers", pattern: /^\/thread-runs$/ },
];

/** The switch behind a request to the service, or null when its path is always served. */
export function aiCapabilityFor(method: string, url: string): AiCapability | null {
  const path = new URL(url, "https://ai.invalid").pathname.replace(/^.*?\/api\/ai(?=\/)/, "");
  const verb = method.toUpperCase();
  const hit = GATED.find((entry) => entry.pattern.test(path) && (!entry.methods || entry.methods.includes(verb)));
  return hit?.capability ?? null;
}

const notFound = (): Response =>
  new Response(JSON.stringify({ ok: false, code: "not_found", error: { code: "not_found" } }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

export function capabilityGatedFetch(
  inner: FetchLike,
  reader: { serves: (name: AiCapability) => Promise<boolean | null> },
): FetchLike {
  return async (input, init) => {
    const capability = aiCapabilityFor(init?.method ?? "GET", input);
    if (capability && (await reader.serves(capability)) === false) return notFound();
    return inner(input, init);
  };
}
