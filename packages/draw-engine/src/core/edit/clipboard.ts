/**
 * Copy / paste / duplicate as pure data transforms. The payload is a plain
 * `.osidraw` document (same envelope as export), so canvas-to-canvas paste and
 * paste-from-file are the same operation. Pasting REMAPS every id — the copies
 * get fresh identities while bindings, labels, and groups stay intact *within*
 * the copied set and are stripped when they point outside it.
 */

import type { DrawElement } from "../scene/element";
import { newElementId } from "../scene/element";
import { elementsFromJson, sceneToJson } from "../export/json";

/** The selection plus what must travel with it: each copied shape's bound label. */
export function expandForCopy(elements: readonly DrawElement[], ids: ReadonlySet<string>): DrawElement[] {
  const wanted = new Set(ids);
  for (const element of elements) {
    if (wanted.has(element.id) && element.boundTextId) wanted.add(element.boundTextId);
  }
  return elements.filter((element) => !element.isDeleted && wanted.has(element.id));
}

/** Serialize the selection to `.osidraw` JSON, or null when nothing is selected. */
export function serializeSelection(elements: readonly DrawElement[], ids: ReadonlySet<string>): string | null {
  const copied = expandForCopy(elements, ids);
  return copied.length > 0 ? sceneToJson(copied) : null;
}

function remapRef(ref: string | null | undefined, idMap: Map<string, string>): string | null {
  return ref ? (idMap.get(ref) ?? null) : null;
}

/**
 * Turn copied JSON back into scene-ready elements: fresh ids (and fresh group
 * ids), internal references remapped, dangling ones dropped, positions offset.
 * Seeds are kept so the hand-drawn look of a copy matches its original.
 */
export function materializeElements(json: string, offsetX: number, offsetY: number, now = 0): DrawElement[] | null {
  const parsed = elementsFromJson(json);
  if (!parsed || parsed.length === 0) return null;
  const source = parsed.filter((element) => !element.isDeleted);

  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const element of source) idMap.set(element.id, newElementId());

  return source.map((element) => {
    let groupId: string | null = null;
    if (element.groupId) {
      groupId = groupMap.get(element.groupId) ?? newElementId();
      groupMap.set(element.groupId, groupId);
    }
    return {
      ...element,
      id: idMap.get(element.id) as string,
      x: element.x + offsetX,
      y: element.y + offsetY,
      startBinding: remapRef(element.startBinding, idMap),
      endBinding: remapRef(element.endBinding, idMap),
      containerId: remapRef(element.containerId, idMap),
      boundTextId: remapRef(element.boundTextId, idMap),
      groupId,
      version: 1,
      updated: now,
      isDeleted: false,
    };
  });
}
