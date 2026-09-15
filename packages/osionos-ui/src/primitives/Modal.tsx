/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Modal.tsx                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  initialFocusRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

const MODAL_STACK: string[] = [];
let bodyLockCount = 0;
let previousBodyOverflow = "";

const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getTabbable(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
}

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow;
}

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "h-[calc(100vh-32px)] max-w-[calc(100vw-32px)]",
} as const;

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  size = "md",
  initialFocusRef,
  children,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const modalId = useMemo(() => crypto.randomUUID(), []);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    MODAL_STACK.push(modalId);
    lockBodyScroll();

    const focusFrame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? getTabbable(dialogRef.current)[0] ?? dialogRef.current;
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      const stackIndex = MODAL_STACK.indexOf(modalId);
      if (stackIndex !== -1) MODAL_STACK.splice(stackIndex, 1);
      unlockBodyScroll();
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [initialFocusRef, modalId, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isTopModal = MODAL_STACK.at(-1) === modalId;
      if (!isTopModal) return;

      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const tabbable = getTabbable(dialogRef.current);
      if (tabbable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalId, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      // Marks the whole modal surface (backdrop + dialog). A modal portals to
      // document.body, so to any outside-click handler on the page beneath it its
      // clicks look like "outside" clicks — including the backdrop mousedown that
      // dismisses the modal, which re-mounts those handlers mid-dispatch and is then
      // delivered to them. Outside-click handlers skip targets inside this marker.
      data-modal-overlay=""
      className="fixed inset-0 z-[var(--osio-z-modal)] flex items-center justify-center bg-[var(--osio-overlay)] px-4 py-6 animate-[osio-overlay-in_var(--osio-dur-base)_var(--osio-ease-standard)]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`w-full overflow-hidden rounded-[var(--osio-radius-overlay)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-e4)] outline-none animate-[osio-modal-in_var(--osio-dur-base)_var(--osio-ease-emphasized)] ${SIZE_CLASS[size]}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title ? <h2 id={titleId} className="sr-only">{title}</h2> : null}
        {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
};
