import { parseMarkdown } from "./block-parser";
import { incrementalParse as incrementalParseFromSource } from "./incremental";
import { renderHtml as renderDocumentHtml, type RenderHtmlOptions } from "./renderer";
import {
  renderMarkdownSource,
  type SourceRenderOptions,
} from "./source-renderer";
import type {
  DocumentNode,
  IncrementalParseResult,
  IncrementalPatch,
  ParseOptions,
  ParseResult,
} from "./types";
import {
  encodeMarkEnginePatch,
  encodeMarkEngineSource,
  measureMarkEngineSourceBytes,
  reviveMarkEngineWorkerError,
  type MarkEngineSourcePayload,
  type MarkEngineWorkerMethod,
  type MarkEngineWorkerRequest,
  type MarkEngineWorkerResponse,
} from "./worker-protocol";

export const DEFAULT_MARKENGINE_WORKER_SYNC_THRESHOLD_BYTES = 8 * 1024;

export interface MarkEngineWorkerEndpoint {
  postMessage(message: unknown, transferList?: ArrayBuffer[]): void;
  terminate?: () => unknown;
  addEventListener?: (
    event: "message" | "error",
    listener: (event: unknown) => void,
  ) => void;
  removeEventListener?: (
    event: "message" | "error",
    listener: (event: unknown) => void,
  ) => void;
  on?: (event: "message" | "error", listener: (event: unknown) => void) => void;
  off?: (event: "message" | "error", listener: (event: unknown) => void) => void;
}

export interface MarkEngineWorkerOptions {
  syncThresholdBytes?: number;
  workerFactory?: () => MarkEngineWorkerEndpoint;
  transferSource?: boolean;
}

export interface MarkEngineWorkerRenderOptions {
  sourceByteLength?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

type WorkerPayloadByMethod = {
  parse: Extract<MarkEngineWorkerRequest, { method: "parse" }>["payload"];
  incrementalParse: Extract<
    MarkEngineWorkerRequest,
    { method: "incrementalParse" }
  >["payload"];
  renderHtml: Extract<
    MarkEngineWorkerRequest,
    { method: "renderHtml" }
  >["payload"];
  renderSource: Extract<
    MarkEngineWorkerRequest,
    { method: "renderSource" }
  >["payload"];
};

function readEventData(event: unknown): unknown {
  if (
    typeof event === "object" &&
    event !== null &&
    "data" in event &&
    !("id" in event)
  ) {
    return (event as { data: unknown }).data;
  }
  return event;
}

function isWorkerResponse(message: unknown): message is MarkEngineWorkerResponse {
  return typeof message === "object" && message !== null && "id" in message;
}

function createStringPayload(source: string): {
  payload: MarkEngineSourcePayload;
  transferList: ArrayBuffer[];
  byteLength: number;
} {
  return {
    payload: { source },
    transferList: [],
    byteLength: measureMarkEngineSourceBytes(source),
  };
}

export class MarkEngineWorker {
  private readonly syncThresholdBytes: number;
  private readonly transferSource: boolean;
  private readonly workerFactory: (() => MarkEngineWorkerEndpoint) | null;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private worker: MarkEngineWorkerEndpoint | null = null;

  constructor(options: MarkEngineWorkerOptions = {}) {
    this.syncThresholdBytes =
      options.syncThresholdBytes ?? DEFAULT_MARKENGINE_WORKER_SYNC_THRESHOLD_BYTES;
    this.transferSource = options.transferSource ?? true;
    this.workerFactory = options.workerFactory ?? null;
  }

  parse(source: string, options: ParseOptions = {}): Promise<ParseResult> {
    if (this.shouldRunSourceSync(source)) {
      return Promise.resolve(parseMarkdown(source, options));
    }

    const encodedSource = this.createSourcePayload(source);
    return this.request<"parse", ParseResult>(
      "parse",
      {
        source: encodedSource.payload,
        options,
      },
      encodedSource.transferList,
      () => parseMarkdown(source, options),
    );
  }

  incrementalParse(
    previousText: string,
    previousResult: ParseResult,
    patch: IncrementalPatch,
  ): Promise<IncrementalParseResult> {
    if (this.shouldRunSourceSync(previousText)) {
      return Promise.resolve(
        incrementalParseFromSource(previousText, previousResult, patch),
      );
    }

    const encodedPreviousText = this.createSourcePayload(previousText);
    const encodedPatch = this.transferSource
      ? encodeMarkEnginePatch(patch)
      : {
          payload: patch,
          transferList: [],
        };

    return this.request<"incrementalParse", IncrementalParseResult>(
      "incrementalParse",
      {
        previousText: encodedPreviousText.payload,
        previousResult,
        patch: encodedPatch.payload,
      },
      [...encodedPreviousText.transferList, ...encodedPatch.transferList],
      () => incrementalParseFromSource(previousText, previousResult, patch),
    );
  }

  renderHtml(
    ast: DocumentNode,
    options: RenderHtmlOptions = {},
    renderOptions: MarkEngineWorkerRenderOptions = {},
  ): Promise<string> {
    if (
      renderOptions.sourceByteLength !== undefined &&
      renderOptions.sourceByteLength < this.syncThresholdBytes
    ) {
      return Promise.resolve(renderDocumentHtml(ast, options));
    }

    return this.request<"renderHtml", string>(
      "renderHtml",
      { ast, options },
      [],
      () => renderDocumentHtml(ast, options),
    );
  }

  renderSource(
    source: string,
    options: SourceRenderOptions = {},
  ): Promise<string> {
    if (this.shouldRunSourceSync(source)) {
      return Promise.resolve(renderMarkdownSource(source, options));
    }

    const encodedSource = this.createSourcePayload(source);
    return this.request<"renderSource", string>(
      "renderSource",
      {
        source: encodedSource.payload,
        options,
      },
      encodedSource.transferList,
      () => renderMarkdownSource(source, options),
    );
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.rejectPendingRequests(new Error("MarkEngine worker was disposed"));
    worker?.terminate?.();
  }

  private shouldRunSourceSync(source: string): boolean {
    return measureMarkEngineSourceBytes(source) < this.syncThresholdBytes;
  }

  private createSourcePayload(source: string): {
    payload: MarkEngineSourcePayload;
    transferList: ArrayBuffer[];
    byteLength: number;
  } {
    return this.transferSource
      ? encodeMarkEngineSource(source)
      : createStringPayload(source);
  }

  private request<
    TMethod extends MarkEngineWorkerMethod,
    TResult,
  >(
    method: TMethod,
    payload: WorkerPayloadByMethod[TMethod],
    transferList: ArrayBuffer[],
    fallback: () => TResult,
  ): Promise<TResult> {
    if (!this.workerFactory && !this.worker) {
      return Promise.resolve(fallback());
    }

    const worker = this.getWorker();
    const id = this.nextRequestId++;
    const request = { id, method, payload } as MarkEngineWorkerRequest;

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });
      worker.postMessage(request, transferList);
    });
  }

  private getWorker(): MarkEngineWorkerEndpoint {
    if (this.worker) return this.worker;
    if (!this.workerFactory) {
      throw new Error("MarkEngineWorker requires a workerFactory for async work");
    }

    const worker = this.workerFactory();
    this.worker = worker;
    this.attachWorker(worker);
    return worker;
  }

  private attachWorker(worker: MarkEngineWorkerEndpoint): void {
    if (worker.addEventListener) {
      worker.addEventListener("message", this.handleWorkerMessage);
      worker.addEventListener("error", this.handleWorkerError);
      return;
    }

    worker.on?.("message", this.handleWorkerMessage);
    worker.on?.("error", this.handleWorkerError);
  }

  private readonly handleWorkerMessage = (event: unknown): void => {
    const response = readEventData(event);
    if (!isWorkerResponse(response)) return;

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;
    this.pendingRequests.delete(response.id);

    if ("error" in response) {
      pending.reject(reviveMarkEngineWorkerError(response.error));
      return;
    }

    pending.resolve(response.result);
  };

  private readonly handleWorkerError = (error: unknown): void => {
    this.rejectPendingRequests(error);
  };

  private rejectPendingRequests(reason: unknown): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}

export function createBrowserMarkEngineWorkerClient(
  workerScriptUrl: string | { toString(): string },
  options: Omit<MarkEngineWorkerOptions, "workerFactory"> = {},
): MarkEngineWorker {
  return new MarkEngineWorker({
    ...options,
    workerFactory: () => {
      const WorkerConstructor = (globalThis as { Worker?: new (
        scriptUrl: string,
        options?: { name?: string; type?: "module" | "classic" },
      ) => MarkEngineWorkerEndpoint }).Worker;

      if (!WorkerConstructor) {
        throw new Error("Web Worker is not available in this environment");
      }

      return new WorkerConstructor(workerScriptUrl.toString(), {
        name: "markengine-worker",
        type: "module",
      });
    },
  });
}