/**
 * The pure half of the appearance summary: which Settings section shows an axis, what the
 * axis and its value are called, and how the jump to it scrolls. Derived from the same
 * label table the panels read, so a new axis needs no edit here beyond its section.
 */

import { ACCENT_PRESETS, CUSTOM_ACCENT, type MotionPreference } from '../../../shared/config/appearance';
import { APPEARANCE_CHOICES, choiceLabel, type ChoiceAxis } from '../../../shared/config/appearanceChoices';

/** The section anchor of the Settings block that renders `axis`; "appearance" when none does. */
export function sectionFor(axis: string): string {
  switch (axis) {
    case 'surface':
    case 'elevation':
    case 'borders':
      return 'style';
    case 'accent':
    case 'hue':
    case 'caretColor':
    case 'caretShape':
    case 'caretBlink':
      return 'color';
    case 'density':
    case 'radius':
    case 'uiScale':
      return 'layout';
    case 'pageTransition':
    case 'overlayTransition':
    case 'motionSpeed':
    case 'easing':
    case 'pressFeedback':
    case 'dragMotion':
      return 'motion';
    case 'linkUnderline':
    case 'motion':
    case 'animatedImages':
    case 'hovercards':
    case 'urlPaste':
      return 'accessibility';
    default:
      return 'appearance';
  }
}

/** The anchor of the single row that renders `axis`, or null when the axis has no row anchor. */
export function rowAnchorFor(axis: string): string | null {
  switch (axis) {
    case 'pageTransition':
      return 'motion-page';
    case 'overlayTransition':
      return 'motion-overlay';
    case 'motionSpeed':
      return 'motion-speed';
    case 'easing':
      return 'motion-easing';
    case 'pressFeedback':
      return 'motion-press';
    case 'dragMotion':
      return 'motion-drag';
    default:
      return null;
  }
}

const isChoiceAxis = (axis: string): axis is ChoiceAxis => Object.hasOwn(APPEARANCE_CHOICES, axis);

/** "pressFeedback" becomes "Press feedback". */
function wordsFromCamelCase(name: string): string {
  const spaced = name.replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What the Settings row for `axis` calls it. */
export function axisLabel(axis: string): string {
  if (isChoiceAxis(axis)) return APPEARANCE_CHOICES[axis].label;
  if (axis === 'accent') return 'Accent color';
  if (axis === 'hue') return 'Accent hue';
  return wordsFromCamelCase(axis);
}

/** What the row shows for the axis's current value. */
export function valueLabel(axis: string, value: unknown): string {
  if (isChoiceAxis(axis)) return choiceLabel(axis, value as never);
  if (axis === 'hue') return `${String(value)}°`;
  if (axis === 'accent') {
    return value === CUSTOM_ACCENT ? 'Custom' : (ACCENT_PRESETS.find((preset) => preset.id === value)?.label ?? String(value));
  }
  return String(value);
}

/** The scroll behavior of a jump: instant when the person's reduced-motion choice, or the OS's on System, is on. */
export function jumpBehavior(motion: MotionPreference, systemReduced: boolean): ScrollBehavior {
  return motion === 'reduce' || (systemReduced && motion !== 'full') ? 'auto' : 'smooth';
}

/** "1 setting changed from the default." / "3 settings changed from the default." / the all-default line. */
export function summaryLine(count: number): string {
  if (count === 0) return 'Everything is at its default.';
  return `${count} ${count === 1 ? 'setting' : 'settings'} changed from the default.`;
}
