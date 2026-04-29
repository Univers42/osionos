/**
 * Shared list marker utilities for numbered and bulleted lists.
 *
 * Location: src/entities/block/model/listMarkers.ts
 *
 * Both BlockEditor (editable) and ReadOnlyBlock use these functions
 * to determine the visual marker for list items based on nesting depth.
 */

// ---------------------------------------------------------------------------
// Numbered list helpers
// ---------------------------------------------------------------------------

function toAlphabetic(index: number): string {
  let value = Math.max(1, index);
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCodePoint(97 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function toRoman(index: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let value = Math.max(1, Math.min(index, 3999));
  let output = "";
  for (const [amount, numeral] of numerals) {
    while (value >= amount) {
      output += numeral;
      value -= amount;
    }
  }
  return output;
}

/**
 * Returns the marker string for a numbered list item.
 *
 * Rotation per depth level:
 *   0 → 1.  2.  3.       (decimal)
 *   1 → a.  b.  c.       (lowercase alpha)
 *   2 → i.  ii. iii.     (lowercase roman)
 *   3 → A.  B.  C.       (uppercase alpha)
 *   4 → I.  II. III.     (uppercase roman)
 *   5 → shapes            (◆ ◇ ● ○ ■ □)
 *   6+ → cycles back to 0
 */
export function getNumberedMarker(index: number, depth: number): string {
  const shapes = ["◆", "◇", "●", "○", "■", "□"];
  switch (depth % 6) {
    case 0:
      return `${index}.`;
    case 1:
      return `${toAlphabetic(index)}.`;
    case 2:
      return `${toRoman(index)}.`;
    case 3:
      return `${toAlphabetic(index).toUpperCase()}.`;
    case 4:
      return `${toRoman(index).toUpperCase()}.`;
    default:
      return shapes[(index - 1) % shapes.length];
  }
}

// ---------------------------------------------------------------------------
// Bulleted list helpers
// ---------------------------------------------------------------------------

/** Visual style of the bullet marker. */
export type BulletStyle = "disc" | "circle" | "square";

/**
 * Returns the bullet style for a bulleted list item.
 *
 * Rotation per depth level:
 *   0 → disc     (●  filled circle)
 *   1 → circle   (○  hollow circle)
 *   2 → square   (■  filled square)
 *   3+ → cycles back to 0
 */
export function getBulletMarker(depth: number): BulletStyle {
  const styles: BulletStyle[] = ["disc", "circle", "square"];
  return styles[depth % styles.length];
}
