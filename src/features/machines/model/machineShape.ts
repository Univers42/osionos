/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineShape.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The two shapes the app checks before it opens a window on a machine: the bridge's random
// machine id and the loopback IDE origin. The origin rule is scripts/ide-machine-protocol.mjs
// isLoopbackIdeOrigin, ported because src/ never imports the bridge's .mjs; the parity test in
// tests/canvas/machines-shape.test.ts runs both on the same inputs. Free of `@/` imports so the
// IDE page and the node canvas runner can load it.

const MACHINE_ID = /^m-[a-z2-7]{16}$/;
const LOOPBACK_HOST = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isMachineId(value: unknown): value is string {
  return typeof value === "string" && MACHINE_ID.test(value);
}

// http, a 127.0.0.0/8 literal, a port 1024-65535, and nothing else: `url.origin === value`
// refuses a path, a query, userinfo and any spelling the URL parser would normalise.
export function isLoopbackIdeOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const octets = LOOPBACK_HOST.exec(url.hostname);
  const port = Number(url.port);
  return url.protocol === "http:" && octets !== null && octets.slice(1).every((part) => Number(part) <= 255)
    && Number.isInteger(port) && port >= 1024 && port <= 65535 && url.origin === value;
}
