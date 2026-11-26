import type { Appearance } from "./theme";

export interface StylePreset {
  id: string;
  label: string;
  /** Applied in one updateAppearance call. Never palette, mode or accent. */
  patch: Partial<Appearance>;
}

/** One-click styles over the surface axes and corners, Calm (today's look) first. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: "calm", label: "Calm", patch: { surface: "solid", elevation: "default", borders: "default", radius: "default" } },
  { id: "paper", label: "Paper", patch: { surface: "solid", elevation: "flat", borders: "strong", radius: "sharp" } },
  { id: "soft", label: "Soft", patch: { surface: "solid", elevation: "deep", borders: "none", radius: "round" } },
  { id: "frost", label: "Frost", patch: { surface: "frosted", elevation: "default", borders: "default", radius: "default" } },
];

/** The id of the style whose every field the appearance matches, or null ("Custom"). Derived, never stored. */
export function activeStyleId(appearance: Appearance): string | null {
  const matches = (patch: Partial<Appearance>) => (Object.keys(patch) as (keyof Appearance)[]).every((key) => appearance[key] === patch[key]);
  return STYLE_PRESETS.find((preset) => matches(preset.patch))?.id ?? null;
}
