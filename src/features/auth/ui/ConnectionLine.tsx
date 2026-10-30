import type { ReactNode } from "react";
import { describeConnection, type ConnectionState } from "@/features/auth/model/portalConnection";
import { API_BASE } from "@/features/auth/model/userStore.helpers";

const Host = ({ name }: { name: string }) => <span className="osio-portal-host">{name}</span>;

const CONNECTION_TEXT: Record<ConnectionState["kind"], (host: string) => ReactNode> = {
  secure: (host) => <>Encrypted connection to <Host name={host} /></>,
  plain: (host) => <>Unencrypted connection to <Host name={host} />. Sign in only on a network you trust.</>,
  offline: () => "No server configured: this copy of osionos keeps your work on this device.",
};

/** The portal's footer: which server a password typed here goes to, and whether the link is encrypted. */
export function ConnectionLine() {
  const state = describeConnection(API_BASE);
  return (
    <p className="osio-portal-connection" data-kind={state.kind}>
      <svg className="osio-portal-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="3" y="7" width="10" height="7" rx="1.6" />
        <path d={state.kind === "secure" ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"} />
      </svg>
      <span>{CONNECTION_TEXT[state.kind](state.host)}</span>
    </p>
  );
}
