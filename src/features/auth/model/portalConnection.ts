// The server the sign-in form talks to, named for the person signing in: an app pointed at the
// team's data center says which host it is and whether the link is encrypted, so a wrong or
// plain-HTTP server is visible before a password is typed. Pure; the Portal passes API_BASE.

export type ConnectionKind = "secure" | "plain" | "offline";

export interface ConnectionState {
  kind: ConnectionKind;
  host: string;
}

export function describeConnection(apiBase: string): ConnectionState {
  if (!apiBase) return { kind: "offline", host: "" };
  try {
    const url = new URL(apiBase);
    return { kind: url.protocol === "https:" ? "secure" : "plain", host: url.hostname };
  } catch {
    // Not a URL: still a server the app will try, and certainly not a verified one.
    return { kind: "plain", host: apiBase };
  }
}
