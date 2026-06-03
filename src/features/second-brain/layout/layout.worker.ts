/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout.worker.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Web Worker entry for the force layout (doc 04 §3). It owns a `LayoutEngine`
 * and bridges it to `postMessage`, so d3-force runs entirely off the main
 * thread — the per-tick main-thread cost is 0 ms by construction.
 *
 * Loaded by the controller via
 *   `new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" })`.
 */

import { type LayoutInbound, LayoutEngine, type LayoutOutbound } from "./layoutEngine";

const ctx = self as unknown as Worker;

const engine = new LayoutEngine((message: LayoutOutbound, transfer?: Transferable[]) => {
  ctx.postMessage(message, transfer ?? []);
});

ctx.onmessage = (event: MessageEvent<LayoutInbound>) => {
  engine.handle(event.data);
};
