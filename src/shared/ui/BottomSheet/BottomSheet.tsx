import React, { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { nextFocusIndex } from "./focusWrap";
import "./bottomSheet.css";

const TABBABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export type CloseSheet = (after?: () => void) => void;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode | ((close: CloseSheet) => React.ReactNode);
}

/** Moves focus one tabbable on, wrapping inside `dialog`; the caller stops the default Tab. */
function wrapFocus(dialog: HTMLElement, backwards: boolean): void {
  const items = [...dialog.querySelectorAll<HTMLElement>(TABBABLE)];
  const target = items[nextFocusIndex(items.length, items.indexOf(document.activeElement as HTMLElement), backwards)];
  target?.focus();
}

/** Renders the sheet's children, handing `close` to a render-prop child. */
const SheetBody: React.FC<{ render: BottomSheetProps["children"]; close: CloseSheet }> = ({ render, close }) => (
  <>{typeof render === "function" ? render(close) : render}</>
);

/**
 * A modal sheet rising from the bottom edge: `role="dialog"` + `aria-modal`, Tab wraps inside it,
 * Escape and a backdrop tap close it, and it spends one history entry so the Android back button
 * closes it instead of leaving. `children` may be a function receiving `close(after)`, which closes
 * first and runs `after` once the history entry is given back (so a page pushed by `after` lands
 * above the sheet's entry, never beneath it).
 *
 * Ponytail: focus returns to the opener only if it is still in the document; the trap is Tab-wrap,
 * not `inert` on the rest of the page, so a screen reader can still browse outside the dialog; a
 * parent that flips `open` to false without `close` leaves its history entry to be given back by
 * cleanup, whose popstate the phone nav then reads as a back.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, children }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const ownsEntry = useRef(false);
  const afterRef = useRef<(() => void) | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const finish = useCallback((): void => {
    const after = afterRef.current;
    afterRef.current = undefined;
    onCloseRef.current();
    after?.();
  }, []);

  const close = useCallback<CloseSheet>((after) => {
    afterRef.current = after;
    if (ownsEntry.current) globalThis.history.back();
    else finish();
  }, [finish]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    globalThis.history.pushState({ osioSheet: true }, "");
    ownsEntry.current = true;
    const onPop = (event: Event): void => {
      if (!ownsEntry.current) return;
      ownsEntry.current = false;
      event.stopImmediatePropagation();
      finish();
    };
    globalThis.addEventListener("popstate", onPop, true);
    dialogRef.current?.querySelector<HTMLElement>(TABBABLE)?.focus();
    return () => {
      globalThis.removeEventListener("popstate", onPop, true);
      if (ownsEntry.current) {
        ownsEntry.current = false;
        globalThis.history.back();
      }
      if (opener?.isConnected) opener.focus();
    };
  }, [open, finish]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "Tab" && dialogRef.current) {
      event.preventDefault();
      wrapFocus(dialogRef.current, event.shiftKey);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" data-testid="bottom-sheet-backdrop" onClick={() => close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="osio-bottom-sheet max-h-[85dvh] w-full overflow-y-auto rounded-t-xl border-t border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]"
      >
        <h2 id={titleId} className="px-4 pb-1 pt-4 text-base font-semibold">{title}</h2>
        <SheetBody render={children} close={close} />
      </div>
    </div>,
    document.body,
  );
};
