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