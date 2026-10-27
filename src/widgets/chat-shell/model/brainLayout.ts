/**
 * Which side of the assistant shows, and how, for the width of its pane. The chat list
 * (left) and the context panel (right) sit beside the chat while the chat keeps
 * CHAT_MIN; below that they slide over it. When only one of them fits beside the
 * chat, opening one folds the other away instead of covering the answer. A reader's
 * choice holds while the pane stays the same size; resized past a size, the width
 * decides again, so a panel opened on a wide pane does not cover a narrow one.
 */

/** w-64 in BrainRail. */
export const RAIL_WIDTH = 256;
/** w-80 in BrainContextPanel. */
export const PANEL_WIDTH = 320;
/** Narrower than this, an answer's tables and code start to wrap. */
export const CHAT_MIN = 560;

/** wide: both sides fit beside the chat; medium: one does; narrow: neither. */
export type PaneSize = "narrow" | "medium" | "wide";

export function paneSize(width: number): PaneSize {
  if (width >= RAIL_WIDTH + PANEL_WIDTH + CHAT_MIN) return "wide";
  return width - Math.max(RAIL_WIDTH, PANEL_WIDTH) >= CHAT_MIN ? "medium" : "narrow";
}

/** What the reader chose for one side, and the size of the pane they chose it at. */
export interface SideChoice {
  open: boolean;
  size: PaneSize;
}

export interface BrainLayout {
  railOpen: boolean;
  railOverlay: boolean;
  panelOpen: boolean;
  panelOverlay: boolean;
}

function choiceAt(choice: SideChoice | null, size: PaneSize): boolean | null {
  return choice?.size === size ? choice.open : null;
}

export function brainLayout(width: number, railChoice: SideChoice | null, panelChoice: SideChoice | null): BrainLayout {
  const size = paneSize(width);
  const railOverlay = width < RAIL_WIDTH + CHAT_MIN;
  const railOpen = choiceAt(railChoice, size) ?? !railOverlay;
  const besideRail = railOpen && !railOverlay ? RAIL_WIDTH : 0;
  return {
    railOpen,
    railOverlay,
    panelOpen: choiceAt(panelChoice, size) ?? size === "wide",
    panelOverlay: width - besideRail - PANEL_WIDTH < CHAT_MIN,
  };
}

/** The choices after the reader opens or shuts the context panel. */
export function togglePanel(width: number, layout: BrainLayout): { rail?: SideChoice; panel: SideChoice } {
  const size = paneSize(width);
  const panel = { open: !layout.panelOpen, size };
  const railBeside = layout.railOpen && !layout.railOverlay;
  return panel.open && railBeside && size === "medium" ? { rail: { open: false, size }, panel } : { panel };
}

/** The choices after the reader opens or shuts the chat list. */
export function toggleRail(width: number, layout: BrainLayout): { rail: SideChoice; panel?: SideChoice } {
  const size = paneSize(width);
  const rail = { open: !layout.railOpen, size };
  const panelBeside = layout.panelOpen && !layout.panelOverlay;
  return rail.open && panelBeside && size === "medium" ? { rail, panel: { open: false, size } } : { rail };
}
