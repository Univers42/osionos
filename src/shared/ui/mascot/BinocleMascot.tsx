/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BinocleMascot.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import "./binocle.scss";

/** The moods the app uses; the names match the website's, so the styles map 1:1. */
export type BinocleMood = "curious" | "listening" | "thinking" | "happy" | "surprised" | "sleeping" | "shy";

interface Props {
  mood: BinocleMood;
  /** Width in px; the height follows the 184:118 ratio. */
  size?: number;
  /** Names the mascot for a screen reader. Without it the mascot is decoration. */
  label?: string;
  className?: string;
}

const SHELL_LEFT = "M15 34 C26 20, 51 16, 69 27 C80 34, 87 48, 86 62 C85 78, 73 90, 55 94 C34 98, 14 90, 7 75 C1 61, 4 45, 15 34Z";
const SHELL_RIGHT = "M115 27 C134 16, 158 20, 169 34 C180 49, 183 65, 177 78 C170 92, 150 98, 129 94 C111 90, 99 78, 98 62 C97 48, 104 34, 115 27Z";
// binocle.scss styles exactly this many slices per barrel.
const TUBE_SLICES = 6;

const TubeStack: React.FC<{ shell: string }> = ({ shell }) => (
  <g className="svg-tube-stack">
    {Array.from({ length: TUBE_SLICES }, (_, index) => (
      <path key={index} className="svg-tube" d={shell} />
    ))}
  </g>
);

const BinocleMascotView = React.forwardRef<SVGSVGElement, Props>(({ mood, size = 112, label, className }, ref) => {
  const decorative = label === undefined;
  return (
    <svg
      ref={ref}
      className={className ? `binocle ${className}` : "binocle"}
      data-mood={mood}
      viewBox="0 0 184 118"
      width={size}
      height={(size * 118) / 184}
      focusable="false"
      {...(decorative ? { "aria-hidden": "true" as const } : { role: "img", "aria-label": label })}
    >
      <g className="svg-body-group">
        <path className="svg-arm left" d="M49 31 C39 18, 25 18, 19 32" />
        <path className="svg-arm right" d="M135 31 C147 18, 161 19, 166 33" />
        <TubeStack shell={SHELL_LEFT} />
        <TubeStack shell={SHELL_RIGHT} />
        <g className="svg-volume">
          <path className="svg-shell" d={SHELL_LEFT} />
          <path className="svg-shell" d={SHELL_RIGHT} />
        </g>
        <path className="svg-barrel" d="M20 39 C29 28, 47 25, 62 32 C50 29, 33 32, 24 43 C16 54, 16 67, 24 77 C12 69, 9 51, 20 39Z" />
        <path className="svg-barrel" d="M122 32 C136 25, 154 28, 164 39 C175 51, 172 69, 160 77 C168 67, 168 54, 160 43 C151 32, 134 29, 122 32Z" />
        <ellipse className="svg-frame" cx="43" cy="57" rx="39" ry="34" />
        <ellipse className="svg-frame" cx="141" cy="57" rx="39" ry="34" />
        <ellipse className="svg-inner-rim" cx="43" cy="57" rx="28" ry="24" />
        <ellipse className="svg-inner-rim" cx="141" cy="57" rx="28" ry="24" />
        <ellipse className="svg-rim" cx="38" cy="53" rx="24" ry="20" />
        <ellipse className="svg-rim" cx="136" cy="53" rx="24" ry="20" />
        <path className="svg-center-band" d="M84 53 C88 48, 96 48, 100 53" />
        <path className="svg-center-band" d="M86 67 C90 71, 95 71, 99 67" />
        <path className="svg-bridge" d="M80 61 C84 51, 91 48, 97 52 C101 55, 104 59, 108 62 C110 63, 112 63, 114 62" />
        <path className="svg-detail" d="M16 55 C20 34, 36 24, 56 28" />
        <path className="svg-detail" d="M19 62 C21 76, 35 86, 52 85" />
        <path className="svg-detail" d="M118 28 C139 23, 158 34, 164 55" />
        <path className="svg-detail" d="M162 63 C159 78, 145 86, 129 84" />
        <path className="svg-brow left" d="M22 20 C34 14, 54 14, 66 21" />
        <path className="svg-brow right" d="M118 21 C130 14, 151 14, 163 20" />
        <ellipse className="svg-cheek" cx="22" cy="68" rx="10" ry="7" />
        <ellipse className="svg-cheek" cx="162" cy="68" rx="10" ry="7" />
        <path className="svg-sweat" d="M166 32 C173 42, 172 50, 165 53 C158 48, 158 40, 166 32Z" />
        <g className="svg-stars">
          <path className="svg-star" d="M23 13 L26 20 L33 21 L28 26 L29 33 L23 29 L17 33 L18 26 L13 21 L20 20Z" />
          <path className="svg-star" d="M159 10 L162 17 L169 18 L164 23 L165 30 L159 26 L153 30 L154 23 L149 18 L156 17Z" />
          <path className="svg-star" d="M94 5 L96 11 L102 12 L98 16 L99 22 L94 19 L89 22 L90 16 L86 12 L92 11Z" />
        </g>
        <g className="svg-eye">
          <g className="svg-blink">
            <circle className="svg-pupil" cx="43" cy="57" r="11.4" />
            <circle className="svg-pupil-shine" cx="38.8" cy="52.8" r="2.7" />
          </g>
        </g>
        <g className="svg-eye">
          <g className="svg-blink">
            <circle className="svg-pupil" cx="141" cy="57" r="11.4" />
            <circle className="svg-pupil-shine" cx="136.8" cy="52.8" r="2.7" />
          </g>
        </g>
        <g className="svg-thought-bubble">
          <circle cx="14" cy="30" r="2.5" />
          <circle cx="9" cy="22" r="4" />
          <circle cx="5" cy="13" r="6" />
        </g>
        <ellipse className="svg-mouth-pad" cx="92" cy="96" rx="23" ry="15" />
        <path className="svg-mouth smile" d="M76 93 C83 105, 101 105, 108 93" />
        <path className="svg-mouth ajar" d="M78 94 C84 102, 100 102, 106 94 C101 99, 84 99, 78 94Z" />
        <path className="svg-mouth flat" d="M81 96 C87 98, 98 98, 103 96" />
        <ellipse className="svg-mouth ooh" cx="92" cy="95" rx="8" ry="10" />
      </g>
    </svg>
  );
});
BinocleMascotView.displayName = "BinocleMascot";

export const BinocleMascot = React.memo(BinocleMascotView);
