/**
 * The progress of a build plan while the decision request builds it (#79).
 *
 * The service builds inside the decision request and records each item's state as it goes
 * (devil C157: no background executor, no stored token), so the card follows the build by
 * reading the approval again until that request answers.
 */

import { fetchApproval, type PlanItemProgress } from "./approvals";

/** How often the card reads the approval while the plan is built. */
export const PLAN_PROGRESS_POLL_MS = 700;

/** "Building: 2 of 5 created, 1 failed" — empty when there is nothing recorded yet. */
export function planProgressWords(progress: readonly PlanItemProgress[] | undefined): string {
  if (!progress || progress.length === 0) return "";
  const created = progress.filter((item) => item.status === "done").length;
  const failed = progress.filter((item) => item.status === "failed").length;
  const words = `Building: ${created} of ${progress.length} created`;
  return failed > 0 ? `${words}, ${failed} failed` : words;
}

/** The word next to an item of the tree; empty while it waits. */
export function planItemStateWords(status: string | undefined): string {
  if (status === "done") return "created";
  if (status === "failed" || status === "skipped") return status;
  return "";
}

/**
 * Reads the approval every `intervalMs` and hands its progress over, until the returned stop
 * is called. A read that fails is skipped: the decision request, not this read, reports the outcome.
 */
export function followPlanProgress(
  approvalId: string,
  onProgress: (progress: PlanItemProgress[] | undefined) => void,
  intervalMs = PLAN_PROGRESS_POLL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async (): Promise<void> => {
    try {
      const found = await fetchApproval(approvalId);
      if (!stopped) onProgress(found.progress);
    } catch {
      // Skipped on purpose, see above: the next tick reads again.
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  timer = setTimeout(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
