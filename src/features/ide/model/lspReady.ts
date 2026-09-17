/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lspReady.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { LSPClient } from "@codemirror/lsp-client";

/** Per-request budget for the sandbox language server. The library default is 3 s; a warm
 *  idle sandbox answers `initialize` in ~0.3 s, but the same exchange overran 3 s while the
 *  machine was busy (load 14–17 during `make all`), which left the IDE without a server. */
export const LSP_REQUEST_TIMEOUT_MS = 10_000;

/** The client once its server has initialized, or null the moment it cannot: the socket
 *  closed (a stopped sandbox is refused within milliseconds, long before any timeout) or
 *  `initialize` failed. Settling `initializing` here is what keeps its rejection from
 *  surfacing as an uncaught error; nothing else may chain on the client before this. */
export function whenInitialized(client: LSPClient, closed: Promise<unknown>): Promise<LSPClient | null> {
  const ready = client.initializing.then(() => client, () => null);
  return Promise.race([ready, closed.then(() => null)]);
}
