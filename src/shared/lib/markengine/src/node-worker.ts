import { handleMarkEngineWorkerRequest } from "./worker-runtime";
import type { MarkEngineWorkerRequest } from "./worker-protocol";

declare const require: (id: string) => {
  parentPort: {
    on(event: "message", listener: (message: MarkEngineWorkerRequest) => void): void;
    postMessage(message: unknown): void;
  } | null;
};

const { parentPort } = require("node:worker_threads");

if (!parentPort) {
  throw new Error("MarkEngine node worker requires worker_threads.parentPort");
}

parentPort.on("message", (message) => {
  parentPort.postMessage(handleMarkEngineWorkerRequest(message));
});