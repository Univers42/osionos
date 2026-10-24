/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiConnectionForm.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The hints the connection forms give BEFORE anything is sent.
 *
 * They are hints, not the law: the service is the authority on what it accepts
 * (an address it refuses comes back as `endpoint_not_allowed`). All this module
 * does is keep the obvious mistakes from travelling.
 */

/** The shape of a base URL we can call. */
export const ENDPOINT_FORMAT = "https://<host>/v1";

/** What to write when the URL is missing. */
export const EMPTY_ENDPOINT_MESSAGE = `Enter the base URL of your server, like ${ENDPOINT_FORMAT}.`;

/** What to write when the URL cannot be read as one. */
export const INVALID_ENDPOINT_MESSAGE = `That is not a URL. Use the ${ENDPOINT_FORMAT} form.`;

/**
 * What to write when the URL points at the user's own machine. Our server
 * makes the call, so `localhost` on their machine is not our `localhost`.
 */
export const LOCALHOST_MESSAGE =
  "Our server calls your endpoint, so localhost never reaches it. Expose it with a tunnel such as Tailscale Funnel or cloudflared, then use that public URL.";

/** What to write when the API key is missing. */
export const EMPTY_API_KEY_MESSAGE = "Paste the API key your provider gave you.";

/** What a field says about itself. */
export interface FieldCheck {
  /** True when the field can be sent as it is. */
  ok: boolean;
  /** The sentence to show under the field — empty when there is nothing to say. */
  message: string;
}

/** True for the hosts that mean "this machine". */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  return host.endsWith(".local");
}

/**
 * Checks the base URL of the user's own endpoint.
 *
 * Empty is refused. A `localhost` address is refused with the tunnel hint,
 * because our server cannot reach it. Everything else is left to the service.
 */
export function validateEndpointUrl(raw: string): FieldCheck {
  const value = raw.trim();
  if (!value) return { ok: false, message: EMPTY_ENDPOINT_MESSAGE };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: INVALID_ENDPOINT_MESSAGE };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: INVALID_ENDPOINT_MESSAGE };
  }
  if (isLocalHost(url.hostname)) return { ok: false, message: LOCALHOST_MESSAGE };
  return { ok: true, message: "" };
}

/** Checks an API key: an empty one is refused, a pasted one is not our business. */
export function validateApiKey(raw: string): FieldCheck {
  return raw.trim() ? { ok: true, message: "" } : { ok: false, message: EMPTY_API_KEY_MESSAGE };
}
