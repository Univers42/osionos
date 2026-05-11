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