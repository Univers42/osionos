/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAppearance.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The React half of the Appearance seam. theme.ts owns the appearance (the
 * <html> attributes and the stored value); these hooks read it back and
 * re-render when it changes, so a preference takes effect without a reload.
 *
 * The four axes that live on <html> are read from the DOM, not from a copy:
 * the boot script writes them before the app mounts, so a reader that waits
 * for the store would miss the choice the person made. urlPaste has no
 * attribute (it changes what a paste does, not what the document looks like)
 * and is read from the live appearance instead.
 */

import { useSyncExternalStore } from "react";

import {
  readCurrentAppearance,
  subscribeAppearance,
  type AnimatedImages,
  type Hovercards,
  type LinkUnderline,
  type MotionPreference,
  type PageChrome,
  type UrlPaste,
} from "./theme";

function attribute(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.getAttribute(name) ?? undefined;
}

/** Whether a card may open on hover. "off" opens it on click or on keyboard
 *  focus instead, so a card never appears under a pointer that did not ask. */
export function useHovercardsEnabled(): boolean {
  return useSyncExternalStore(
    subscribeAppearance,
    () => attribute("data-hovercards") !== "off",
    () => true,
  );
}

/** The person's own motion choice: "system" follows the OS, "reduce"/"full"
 *  override it. */
export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(
    subscribeAppearance,
    () => {
      const motion = attribute("data-motion");
      return motion === "reduce" || motion === "full" ? motion : "system";
    },
    () => "system",
  );
}

/** What Motion's MotionConfig needs: "user" follows the OS, "always" and
 *  "never" are the person's own choice and win over the OS. */
export function useMotionConfigMode(): "user" | "always" | "never" {
  const motion = useMotionPreference();
  if (motion === "reduce") return "always";
  if (motion === "full") return "never";
  return "user";
}

/** Whether every link is underlined at rest. */
export function useLinkUnderline(): LinkUnderline {
  return useSyncExternalStore(
    subscribeAppearance,
    () => (attribute("data-link-underline") === "always" ? "always" : "default"),
    () => "default",
  );
}

/** How animated images behave: "play" always, "still" never, "system" follows
 *  the motion choice (the OS, unless the person overrode it). */
export function useAnimatedImagesMode(): AnimatedImages {
  return useSyncExternalStore(
    subscribeAppearance,
    () => {
      const mode = attribute("data-animated-images");
      return mode === "system" || mode === "still" ? mode : "play";
    },
    () => "play",
  );
}

/** What a pasted bare URL becomes: a link, or the text exactly as it was. */
export function useUrlPasteMode(): UrlPaste {
  return useSyncExternalStore(
    subscribeAppearance,
    () => readCurrentAppearance().urlPaste,
    () => "link",
  );
}

/** Whether hovercards are on — the raw choice, for a panel that shows it. */
export function useHovercardsChoice(): Hovercards {
  return useSyncExternalStore(
    subscribeAppearance,
    () => (attribute("data-hovercards") === "off" ? "off" : "on"),
    () => "on",
  );
}

/** Whether pages draw their table-of-contents rail. */
export function usePageOutline(): PageChrome {
  return useSyncExternalStore(
    subscribeAppearance,
    () => (attribute("data-page-outline") === "hide" ? "hide" : "show"),
    () => "show",
  );
}

/** Whether pages draw their property rows under the title. */
export function usePageProperties(): PageChrome {
  return useSyncExternalStore(
    subscribeAppearance,
    () => (attribute("data-page-properties") === "hide" ? "hide" : "show"),
    () => "show",
  );
}
