/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reconnectBackoff.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface ReconnectBackoff {
  delivered(): void;
  next(): number;
}

/** Reconnect delays for the IDE sync socket: 1 s, 4 s, then every 15 s. Only a socket that
 *  delivered data resets the ladder — the bridge accepts the WebSocket before it learns the
 *  sandbox is stopped and then refuses it, so "opened" proves nothing. */
export function createReconnectBackoff(): ReconnectBackoff {
  let attempt = 0;
  return {
    delivered() { attempt = 0; },
    next() {
      const delay = [1000, 4000, 15000][Math.min(attempt, 2)];
      attempt += 1;
      return delay;
    },
  };
}
