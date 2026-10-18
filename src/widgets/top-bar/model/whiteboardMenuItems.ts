import type { MenuItemSpec } from "./workbenchMenuItems";

export interface WhiteboardViewActionMap {
  newBoard: () => void;
  openWhiteboard: () => void;
}

/** The View-menu whiteboard items: a fresh board first (where New drawing was), then
 *  the gallery. `available` is false when the build cannot load the whiteboard at all. */
export function whiteboardViewItems(available: boolean, actions: WhiteboardViewActionMap): MenuItemSpec[] {
  if (!available) return [];
  return [
    { id: "view.new-whiteboard", label: "New whiteboard", run: actions.newBoard },
    { id: "view.whiteboard", label: "Whiteboard", run: actions.openWhiteboard },
  ];
}
