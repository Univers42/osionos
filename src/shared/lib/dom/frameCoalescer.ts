type FrameScheduler = Pick<typeof globalThis, "requestAnimationFrame" | "cancelAnimationFrame">;

/** A pointer fires several moves per frame; only the last one is worth painting. `push`
 *  keeps the latest value and applies it on the next frame; `flush` applies it now. */
export function coalesceToFrame<T>(apply: (value: T) => void, frames: FrameScheduler = globalThis) {
  let pending: { value: T } | null = null;
  let frameId = 0;
  const run = () => {
    frameId = 0;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    apply(value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (!frameId) frameId = frames.requestAnimationFrame(run);
    },
    flush() {
      if (frameId) frames.cancelAnimationFrame(frameId);
      run();
    },
  };
}
