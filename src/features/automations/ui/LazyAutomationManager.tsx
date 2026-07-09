import React, { Suspense, lazy } from "react";

/**
 * Code-split boundary for the Keyboard-shortcuts settings tab. The automation
 * table + its persisted store form one async chunk so the settings center never
 * drags the shortcut manager into its warm bundle.
 */
const AutomationManagerPanel = lazy(() =>
  import("./AutomationManagerPanel").then((m) => ({ default: m.AutomationManagerPanel })),
);

const Loading: React.FC = () => (
  <div className="flex items-center justify-center py-8">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
  </div>
);

export const LazyAutomationManager: React.FC = () => (
  <Suspense fallback={<Loading />}>
    <AutomationManagerPanel />
  </Suspense>
);
