/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appearanceChoices.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The names a person reads for every appearance axis, in the order the
// Settings panels show them. Settings › Preferences and the top-bar ':' mode
// both read this table, so a label renamed here is renamed everywhere.

import type { Appearance } from "./appearance";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** The appearance axes that are a closed list of named values (accent and hue are not). */
export type ChoiceAxis =
  | "density" | "radius" | "uiScale"
  | "surface" | "elevation" | "borders"
  | "caretColor" | "caretShape" | "caretBlink"
  | "linkUnderline" | "motion" | "pageTransition" | "overlayTransition" | "motionSpeed" | "easing" | "pressFeedback"
  | "animatedImages" | "hovercards" | "urlPaste";

export interface AxisChoices<K extends ChoiceAxis> {
  label: string;
  options: ChoiceOption<Appearance[K]>[];
}

export const APPEARANCE_CHOICES: { readonly [K in ChoiceAxis]: AxisChoices<K> } = {
  density: { label: "Density", options: [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }] },
  radius: { label: "Corners", options: [{ value: "sharp", label: "Sharp" }, { value: "default", label: "Default" }, { value: "round", label: "Round" }] },
  uiScale: { label: "Text size", options: [{ value: "small", label: "Small" }, { value: "default", label: "Default" }, { value: "large", label: "Large" }] },
  surface: { label: "Surface", options: [{ value: "solid", label: "Solid" }, { value: "frosted", label: "Frosted" }, { value: "glass", label: "Glass" }] },
  elevation: { label: "Depth", options: [{ value: "flat", label: "Flat" }, { value: "default", label: "Default" }, { value: "deep", label: "Deep" }] },
  borders: { label: "Borders", options: [{ value: "none", label: "None" }, { value: "default", label: "Default" }, { value: "strong", label: "Strong" }] },
  caretColor: {
    label: "Caret color",
    options: [
      { value: "accent", label: "Accent" }, { value: "text", label: "Text" }, { value: "blue", label: "Blue" },
      { value: "green", label: "Green" }, { value: "purple", label: "Purple" }, { value: "red", label: "Red" },
      { value: "orange", label: "Orange" }, { value: "pink", label: "Pink" },
    ],
  },
  caretShape: {
    label: "Caret shape",
    options: [{ value: "bar", label: "Thin" }, { value: "thick", label: "Thick" }, { value: "block", label: "Block" }, { value: "underscore", label: "Underline" }],
  },
  caretBlink: { label: "Caret blink", options: [{ value: "on", label: "Blink" }, { value: "off", label: "Steady" }] },
  linkUnderline: { label: "Link underlines", options: [{ value: "default", label: "Default" }, { value: "always", label: "Always" }] },
  motion: { label: "Motion", options: [{ value: "system", label: "System" }, { value: "reduce", label: "Reduce" }, { value: "full", label: "Full" }] },
  pageTransition: {
    label: "Page and tab transition",
    options: [
      { value: "none", label: "None" }, { value: "fade", label: "Fade" }, { value: "blur", label: "Blur" },
      { value: "slide", label: "Slide" }, { value: "scale", label: "Scale" },
    ],
  },
  overlayTransition: {
    label: "Menus and dialogs",
    options: [
      { value: "default", label: "Default" }, { value: "none", label: "None" }, { value: "fade", label: "Fade" },
      { value: "blur", label: "Blur" }, { value: "zoom", label: "Zoom" },
    ],
  },
  motionSpeed: { label: "Animation speed", options: [{ value: "slow", label: "Slow" }, { value: "default", label: "Default" }, { value: "fast", label: "Fast" }] },
  easing: { label: "Easing style", options: [{ value: "standard", label: "Standard" }, { value: "snappy", label: "Snappy" }, { value: "smooth", label: "Smooth" }, { value: "bouncy", label: "Bouncy" }] },
  pressFeedback: { label: "Button press", options: [{ value: "default", label: "Default" }, { value: "none", label: "None" }, { value: "squish", label: "Squish" }] },
  animatedImages: { label: "Animated images", options: [{ value: "play", label: "Play" }, { value: "system", label: "System" }, { value: "still", label: "Still" }] },
  hovercards: { label: "Hovercards", options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }] },
  urlPaste: { label: "Paste a link", options: [{ value: "link", label: "Link" }, { value: "plain", label: "Plain" }] },
};

/** The label of one value of an axis. */
export function choiceLabel<K extends ChoiceAxis>(axis: K, value: Appearance[K]): string {
  const options: ChoiceOption<string>[] = APPEARANCE_CHOICES[axis].options;
  return options.find((option) => option.value === value)?.label ?? String(value);
}
