/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useHasBeenNearViewport.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState, type RefObject } from "react";

/** True once the element has come within 200px of the viewport, and stays true.
 *  A frame is mounted only then: its stall timer starts at mount, and a frame the
 *  browser has deliberately not loaded yet (offscreen, `loading="lazy"`) would
 *  otherwise be reported as not responding.
 *
 *  Caveat: without IntersectionObserver (old webviews, node) it answers true at
 *  once, so every frame mounts eagerly there. */
export function useHasBeenNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const element = ref.current;
    if (isNear || !element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isNear, ref]);
  return isNear;
}
