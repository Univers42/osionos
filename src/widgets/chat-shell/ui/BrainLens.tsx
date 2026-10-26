import React from "react";

import styles from "./BrainLens.module.css";

/** The frame of the composer; its ring turns while an answer is being written. */
export const BrainLens: React.FC<{ working: boolean; children: React.ReactNode }> = ({ working, children }) => (
  <div className={styles.lens} data-working={working} data-testid="brain-lens">
    {children}
  </div>
);
