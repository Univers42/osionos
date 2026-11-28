import React, { Suspense } from "react";

import { BindingSourcesProvider } from "@/features/bindings/ui/BindingSourcesProvider";
import { ShellHosts } from "./ShellHosts";

const LazyPhoneShell = React.lazy(() =>
  import("@/widgets/phone-shell").then((module) => ({ default: module.PhoneShell })),
);

/** The signed-in shell below 768px: the phone shell plus the overlays both shells share. The
 *  desktop chrome and its workbench hooks never mount here, nor does their chunk download. */
export const PhoneApp: React.FC = () => (
  <BindingSourcesProvider>
    <div data-testid="app-shell" className="relative flex h-dvh w-screen flex-col overflow-hidden bg-[var(--osio-bg-canvas)]">
      <Suspense fallback={null}>
        <LazyPhoneShell />
      </Suspense>
      <ShellHosts />
    </div>
  </BindingSourcesProvider>
);
