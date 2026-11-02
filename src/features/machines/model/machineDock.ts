// Opens the workbench dock on the terminal, for "Open in terminal" on a machine folder.
import React from "react";

import { openWorkbenchTerminal } from "@/widgets/workbench/model/workbenchMenuActions";

export function useWorkbenchDockOpener(): () => void {
  return React.useCallback(() => { openWorkbenchTerminal("new"); }, []);
}
