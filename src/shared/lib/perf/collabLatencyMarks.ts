/**
 * User-Timing marks for the live co-editing path, read by the Playwright latency spec
 * (tests/e2e/latency/coedit-latency.spec.mjs) from `performance.getEntriesByName`.
 * Off by default: the flag is read once at module load, so the hot-path cost when off is
 * one boolean test. Enable before the app loads: localStorage.setItem('osio:collab-timing', '1').
 *
 *   collab:frame            a gateway frame reached the adapter (before JSON.parse)
 *   collab:dom              text was written into a block; detail.len = its text length (read only when on)
 *   collab:frame-to-dom     measure from the latest frame mark to that DOM write
 *
 * Caveat: the frame mark is the latest frame of ANY type (presence and caret frames too), so
 * frame-to-dom can under-report when a non-content frame arrived between the content frame
 * and its DOM write. It never over-reports.
 */

export const COLLAB_TIMING_FLAG = "osio:collab-timing";

interface MarkSink {
  mark(name: string, options?: { detail?: unknown }): { startTime: number };
  measure(name: string, options?: { start?: number; end?: number; detail?: unknown }): unknown;
}

export interface CollabLatencyMarks {
  frameReceived(): void;
  blockTextWritten(node: { textContent: string | null }): void;
}

const NOOP: CollabLatencyMarks = { frameReceived() {}, blockTextWritten() {} };

export function createCollabLatencyMarks(enabled: boolean, sink: MarkSink): CollabLatencyMarks {
  if (!enabled) return NOOP;
  let lastFrameAt: number | null = null;
  return {
    frameReceived() {
      lastFrameAt = sink.mark("collab:frame").startTime;
    },
    blockTextWritten(node) {
      const detail = { len: node.textContent?.length ?? 0 };
      const end = sink.mark("collab:dom", { detail }).startTime;
      if (lastFrameAt !== null) sink.measure("collab:frame-to-dom", { start: lastFrameAt, end, detail });
    },
  };
}

function flagIsOn(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(COLLAB_TIMING_FLAG) === "1";
  } catch {
    return false; // storage blocked (private mode, sandboxed iframe): stay off
  }
}

export const collabLatencyMarks: CollabLatencyMarks = createCollabLatencyMarks(
  typeof performance !== "undefined" && flagIsOn(),
  performance,
);
