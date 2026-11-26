import type { MenuAction } from "./menuTypes";

/** The View-menu Whiteboard item: hydrawn's gallery, where boards are created and opened.
 *  `available` is false when the build cannot load the whiteboard at all. */
export function whiteboardViewItems(available: boolean, openWhiteboard: () => void): MenuAction[] {
  if (!available) return [];
  return [{ id: "view.whiteboard", label: "Whiteboard", run: openWhiteboard }];
}
