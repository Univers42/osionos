import React from "react";

import styles from "./BrainLens.module.css";

/**
 * The lit frame of the composer: a glowing ring at rest, turning while it has the focus or an
 * answer streams. `tray` hangs under the ring as the composer's drawer (the apps strip).
 */
export const BrainLens: React.FC<{ working: boolean; tray?: React.ReactNode; children: React.ReactNode }> = ({
  working, tray, children,
}) => {
  const lens = (
    <div className={styles.lens} data-working={working} data-testid="brain-lens">
      {children}
    </div>
  );
  if (!tray) return lens;
  return (
    <div>
      {lens}
      <div className={styles.tray} data-testid="brain-lens-tray">{tray}</div>
    </div>
  );
};
