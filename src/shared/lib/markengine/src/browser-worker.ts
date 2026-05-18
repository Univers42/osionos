/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   browser-worker.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { handleMarkEngineWorkerRequest } from "./worker-runtime";
import type { MarkEngineWorkerRequest } from "./worker-protocol";

interface BrowserWorkerScope {
  onmessage: ((event: { data: MarkEngineWorkerRequest }) => void) | null;
  postMessage(message: unknown): void;
}

const workerScope = globalThis as unknown as BrowserWorkerScope;

workerScope.onmessage = (event) => {
  workerScope.postMessage(handleMarkEngineWorkerRequest(event.data));
};