import { createContext, useContext } from "react";

import { isLayoutModesEnabled } from "@/shared/config/featureFlags";

// Caveat: the flag is read once, when this module loads, so flipping
// `osio.layout.modes` shows on the next reload, not on the open page. Tests and
// previews set it with LayoutModesContext.Provider instead.
export const LayoutModesContext = createContext<boolean>(isLayoutModesEnabled());

/** Whether blocks render their stored style and column lists their layout mode. */
export function useLayoutModes(): boolean {
  return useContext(LayoutModesContext);
}
