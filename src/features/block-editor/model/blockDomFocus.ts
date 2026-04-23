export type CaretPlacement = "start" | "end";

function resolveEditableBlock(blockId: string): HTMLElement | null {
  const block = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!block) {
    return null;
  }

  // Priority: contenteditable → textarea → input → direct child button → wrapper
  const editable =
    (block.querySelector("[contenteditable]") as HTMLElement | null) ??
    (block.querySelector("textarea") as HTMLElement | null) ??
    (block.querySelector("input") as HTMLElement | null) ??
    (block.querySelector(":scope > button") as HTMLElement | null) ??
    (block as HTMLElement);

  // Ensure the fallback wrapper element is focusable
  if (editable === block && !block.hasAttribute("tabindex")) {
    (block as HTMLElement).setAttribute("tabindex", "-1");
  }

  return editable;
}

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  // Textarea and input: use selectionStart/selectionEnd
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const pos = placement === "end" ? target.value.length : 0;
    target.selectionStart = pos;
    target.selectionEnd = pos;
    return;
  }

  // ContentEditable: use Selection API
  if (!target.isContentEditable) return;

  const selection = globalThis.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(placement !== "end");
  selection.removeAllRanges();
  selection.addRange(range);
}

export function focusEditableBlock(
  blockId: string,
  placement: CaretPlacement = "start",
  remainingFrames = 10,
) {
  const focusAttempt = () => {
    const editable = resolveEditableBlock(blockId);
    if (!editable) {
      if (remainingFrames > 0) {
        remainingFrames -= 1;
        requestAnimationFrame(focusAttempt);
      }
      return;
    }

    editable.focus();
    editable.scrollIntoView({ block: "nearest", behavior: "smooth" });
    placeCaret(editable, placement);

    if (document.activeElement !== editable && remainingFrames > 0) {
      remainingFrames -= 1;
      requestAnimationFrame(focusAttempt);
    }
  };

  requestAnimationFrame(focusAttempt);
}
