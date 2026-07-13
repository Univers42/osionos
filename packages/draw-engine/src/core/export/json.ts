/**
 * The `.osidraw` document format: a versioned JSON envelope around the live
 * elements. Pure + node-tested; round-trips for save/open and clipboard.
 */

import type { DrawElement } from "../scene/element";

export interface OsidrawFile {
  type: "osidraw";
  version: number;
  elements: DrawElement[];
}

export function sceneToJson(elements: readonly DrawElement[]): string {
  const file: OsidrawFile = {
    type: "osidraw",
    version: 1,
    elements: elements.filter((element) => !element.isDeleted),
  };
  return JSON.stringify(file, null, 2);
}

/** Parse an `.osidraw` document; null if it isn't one. */
export function elementsFromJson(json: string): DrawElement[] | null {
  try {
    const data = JSON.parse(json) as Partial<OsidrawFile>;
    if (data?.type === "osidraw" && Array.isArray(data.elements)) return data.elements as DrawElement[];
  } catch {
    /* not JSON / not an osidraw file */
  }
  return null;
}
