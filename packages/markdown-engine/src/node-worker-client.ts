/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   node-worker-client.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  MarkEngineWorker,
  type MarkEngineWorkerEndpoint,
  type MarkEngineWorkerOptions,
} from "./worker-client";

declare const __dirname: string;
declare const require: (id: string) => unknown;

export interface NodeMarkEngineWorkerOptions
  extends Omit<MarkEngineWorkerOptions, "workerFactory"> {
  workerScriptPath?: string | { toString(): string };
}

export function createNodeMarkEngineWorkerClient(
  options: NodeMarkEngineWorkerOptions = {},
): MarkEngineWorker {
  const { workerScriptPath, ...clientOptions } = options;

  return new MarkEngineWorker({
    ...clientOptions,
    workerFactory: () => {
      const { Worker } = require("node:worker_threads") as {
        Worker: new (filename: string) => MarkEngineWorkerEndpoint;
      };
      const { join } = require("node:path") as {
        join: (...parts: string[]) => string;
      };

      return new Worker(workerScriptPath?.toString() ?? join(__dirname, "node-worker.js"));
    },
  });
}