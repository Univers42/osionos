import React from "react";

import { DURATION_TOKENS, EASING_TOKENS } from "../styleGuideData";
import { StyleGuideSection, TokenLabel } from "./StyleGuideSection";

const TRACK = "group h-6 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--osio-bg-muted)]";
const DOT =
  "h-6 w-6 rounded-full bg-[var(--osio-accent)] transition-transform group-hover:translate-x-24";

function MotionRow({ token, dotStyle }: { token: string; dotStyle: React.CSSProperties }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TokenLabel token={token} />
      <div className={TRACK}>
        <div data-token={token} className={DOT} style={dotStyle} />
      </div>
    </div>
  );
}

export const MotionSection: React.FC = () => (
  <StyleGuideSection title="Motion">
    <h3 className="text-xs font-medium text-[var(--osio-fg-muted)]">Durations</h3>
    <div className="space-y-2">
      {DURATION_TOKENS.map((token) => (
        <MotionRow key={token} token={token} dotStyle={{ transitionDuration: `var(${token})` }} />
      ))}
    </div>
    <h3 className="text-xs font-medium text-[var(--osio-fg-muted)]">Easings</h3>
    <div className="space-y-2">
      {EASING_TOKENS.map((token) => (
        <MotionRow
          key={token}
          token={token}
          dotStyle={{
            transitionTimingFunction: `var(${token})`,
            transitionDuration: "var(--osio-dur-slow)",
          }}
        />
      ))}
    </div>
  </StyleGuideSection>
);
