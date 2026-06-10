/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lazyMount.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One IntersectionObserver shared by every cell of a stage (the legacy editor
// created an observer per cell). Cells mount their nested block editor only
// when they come within the root margin of the viewport.

export interface LazyMounter {
  observe: (element: Element, onVisible: () => void) => () => void;
  disconnect: () => void;
}

export function createLazyMounter(rootMargin = "480px 0px 480px 0px"): LazyMounter {
  if (typeof IntersectionObserver === "undefined") {
    return { observe: (_element, onVisible) => { onVisible(); return () => {}; }, disconnect: () => {} };
  }

  const callbacks = new Map<Element, () => void>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const onVisible = callbacks.get(entry.target);
      if (!onVisible) continue;
      callbacks.delete(entry.target);
      observer.unobserve(entry.target);
      onVisible();
    }
  }, { rootMargin });

  return {
    observe(element, onVisible) {
      callbacks.set(element, onVisible);
      observer.observe(element);
      return () => {
        callbacks.delete(element);
        observer.unobserve(element);
      };
    },
    disconnect() {
      callbacks.clear();
      observer.disconnect();
    },
  };
}
