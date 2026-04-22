export type CaretPlacement = "start" | "end";

function resolveEditableBlock(blockId: string): HTMLElement | null {
  const block = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!block) {
    return null;
  }

  return (block.querySelector("[contenteditable]") as HTMLElement | null) ?? (block as HTMLElement);
}

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(placement === "end");
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
    placeCaret(editable, placement);

    if (document.activeElement !== editable && remainingFrames > 0) {
      remainingFrames -= 1;
      requestAnimationFrame(focusAttempt);
    }
  };

  requestAnimationFrame(focusAttempt);
}
