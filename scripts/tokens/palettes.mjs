// The seeds every colour in the app grows from. A palette is a neutral hue
// with its chroma (how tinted the greys are) and an accent hue with its chroma;
// ramps.mjs turns those four numbers into every tone, in both modes.
//
// A palette's id is stored in each user's browser, so it never changes. Its
// label can: "warm" is shown as "Calm".

export const MODES = ["light", "dark"];

export const PALETTES = [
  {
    id: "warm",
    label: "Calm",
    description: "Warm paper greys with one deep cobalt for actions, links and focus.",
    signatureMode: "light",
    neutral: { hue: 88, chroma: 0.012 },
    accent: { hue: 260.8, chroma: 0.176 },
  },
];
