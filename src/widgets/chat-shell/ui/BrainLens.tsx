import React from "react";

import styles from "./BrainLens.module.css";

/** The lit frame of the composer: a glowing ring at rest, turning while it has the focus or an answer streams. */
export const BrainLens: React.FC<{ working: boolean; children: React.ReactNode }> = ({ working, children }) => (
  <div className={styles.lens} data-working={working} data-testid="brain-lens">
    {children}
  </div>
);
