import { useEffect, type RefObject } from "react";

type ClickOutsideRef = RefObject<Element | null>;
type ClickOutsideRefs = ClickOutsideRef | ReadonlyArray<ClickOutsideRef>;

export function useClickOutside(
  refs: ClickOutsideRefs,
  onClickOutside: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const refsToCheck = Array.isArray(refs) ? refs : [refs];

      if (!target || refsToCheck.some((ref) => ref.current?.contains(target))) {
        return;
      }

      onClickOutside();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [enabled, onClickOutside, refs]);
}
