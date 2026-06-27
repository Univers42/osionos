/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DeferredMount.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

interface DeferredMountProps {
  /** Reserved height while unmounted — avoids layout shift (CLS) when it pops in. */
  minHeight?: number;
  /** How far ahead of the viewport to mount (matches the canvas lazy-mounter). */
  rootMargin?: string;
  children: React.ReactNode;
}

/**
 * Mounts its children only once their placeholder scrolls within `rootMargin`
 * of the viewport, then keeps them mounted. Used by the Home canvas so the
 * below-the-fold NDS sections (Learn / Events / Home views / Templates) do no
 * work on first paint while still reserving their height. Falls back to mounting
 * immediately where IntersectionObserver is unavailable (tests/SSR).
 */
export const DeferredMount: React.FC<DeferredMountProps> = ({ minHeight = 240, rootMargin = "400px 0px", children }) => {
  const [visible, setVisible] = React.useState(() => typeof IntersectionObserver === "undefined");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
};
