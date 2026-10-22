/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accessTokenWords.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AiAccessToken } from "@/features/ai/api/aiClient";
import { AiError } from "@/features/ai/api/aiContract";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

/** The environment variable the snippet reads the token from (C112). */
export const PAT_ENV_VAR = "OSIONOS_PAT";

/**
 * What an agent with the token may read, in the words of the user (C119).
 *
 * osionos hands over what the token's scope allows and nothing else: the
 * agent's other tools are outside our reach, and we say so.
 */
export const AGENT_COPY =
  "An agent using this token reads text that other members wrote. osionos cannot see or control the agent's other tools.";

/** The words of a session that is too old to mint a token (C113). */
export const REAUTH_MESSAGE = "Sign in again to create a token.";

/**
 * The refusals of the service, in plain words.
 *
 * The codes are the ones the service answers with; every one of them has a
 * sentence here, so the panel never shows a code to a person.
 */
export const TOKEN_REFUSALS: Record<string, string> = {
  reauth_required: REAUTH_MESSAGE,
  workspace_forbidden: "You are not a member of one of the workspaces you chose.",
  too_many_tokens: "You already hold twenty live tokens. Revoke one to make room.",
  rate_limited: "Too many tokens minted in a minute. Wait a moment and try again.",
};

/** The sentence of a refusal: the code's own words, or the generic one. */
export function tokenFailureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return errorWords("network_error");
  return TOKEN_REFUSALS[code] ?? errorWords(code);
}

/**
 * The snippet the user copies into the configuration of their agent.
 *
 * It reads the token from an environment variable and NEVER from a literal:
 * a config file with the token in it is a file the token escapes from (C112).
 */
export function tokenConfigSnippet(): string {
  return `export ${PAT_ENV_VAR}="<the token you just copied>"`;
}

/** The day a token was last used, in the words of the panel. */
export function lastUsedWords(token: AiAccessToken): string {
  if (token.revokedAt) return "Revoked";
  if (token.lastUsedAt) return `Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`;
  return "Never used";
}

/**
 * True when the service answered 404 to the list: the feature is off on this
 * deployment (R-C4a) and the panel renders nothing. Any other failure stays a
 * message. Caveat: a 404 from a proxy in front of a service that has the
 * feature on also hides the panel.
 */
export function isAccessTokensOff(failure: unknown): boolean {
  return failure instanceof AiError && failure.status === 404;
}
