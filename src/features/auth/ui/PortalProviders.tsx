import { Button } from "@osionos/ui/atoms/Button";
import { GitHubMark, GoogleMark } from "./providerMarks";
import "./portal-providers.css";

type Provider = "google" | "github";

interface PortalProvidersProps {
  onGoogle?: () => void;
  onGitHub?: () => void;
  /** The provider whose sign-in is under way. */
  busy?: Provider | null;
  /** The email form is signing in, so no second sign-in may start. */
  disabled?: boolean;
}

const PROVIDERS = [
  { id: "google", name: "Google", Mark: GoogleMark },
  { id: "github", name: "GitHub", Mark: GitHubMark },
] as const;

/**
 * "Continue with Google / GitHub" above the email form, then an "or" divider. A provider with
 * no handler is not offered, and with none the block renders nothing: the caller passes a
 * handler only when the server is reachable and reports that provider on.
 */
export function PortalProviders({ onGoogle, onGitHub, busy = null, disabled = false }: PortalProvidersProps) {
  const handlers: Record<Provider, (() => void) | undefined> = { google: onGoogle, github: onGitHub };
  const offered = PROVIDERS.filter((provider) => handlers[provider.id]);
  if (offered.length === 0) return null;
  return (
    <>
      <div className="osio-portal-providers">
        {offered.map(({ id, name, Mark }) => (
          <Button
            key={id} tone="default" size="lg" className="osio-portal-provider" data-provider={id}
            aria-busy={busy === id || undefined} disabled={busy !== null || disabled} onClick={handlers[id]}
          >
            <span className="osio-portal-provider-mark" aria-hidden="true"><Mark /></span>
            <span className="osio-portal-provider-label">{busy === id ? `Opening ${name}…` : `Continue with ${name}`}</span>
            {busy === id ? <span className="osio-portal-spinner" aria-hidden="true" /> : null}
          </Button>
        ))}
      </div>
      <p className="osio-portal-divider">or</p>
    </>
  );
}
