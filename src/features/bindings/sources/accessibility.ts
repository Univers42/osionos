/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accessibility.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Appearance } from "@/shared/config/theme";
import {
  readCurrentAppearance,
  subscribeAppearance,
  updateAppearance as updateAppearanceReal,
} from "@/shared/config/theme";
import { createStoreRecordSource } from "@/entities/block/model/bindingSources";
import type { FieldSpec, RecordSource } from "@/entities/block/model/bindingSources";

export interface UserStoreState {
  activeUserId: string;
}

type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };

const ACCESSIBILITY_FIELDS: readonly FieldSpec[] = [
  { key: "linkUnderline", display: "segmented", label: "Link underlines", options: [{ value: "default", label: "Default" }, { value: "always", label: "Always" }] },
  { key: "motion", display: "segmented", label: "Motion", options: [{ value: "system", label: "System" }, { value: "reduce", label: "Reduce" }, { value: "full", label: "Full" }] },
  { key: "animatedImages", display: "segmented", label: "Animated images", options: [{ value: "play", label: "Play" }, { value: "system", label: "System" }, { value: "still", label: "Still" }] },
  { key: "hovercards", display: "switch", label: "Hovercards" },
  { key: "urlPaste", display: "segmented", label: "Paste a link", options: [{ value: "link", label: "Link" }, { value: "plain", label: "Plain" }] },
];

function resolveAppearanceStore(deps: {
  appearance?: StoreLike<Appearance>;
  theme?: StoreLike<Appearance>;
  store?: StoreLike<Appearance>;
}): StoreLike<Appearance> {
  const provided = deps.appearance ?? deps.theme ?? deps.store;
  if (provided) return provided;
  let previous = readCurrentAppearance();
  return {
    getState: () => readCurrentAppearance(),
    subscribe: (cb) => subscribeAppearance(() => {
      const next = readCurrentAppearance();
      cb(next, previous);
      previous = next;
    }),
  };
}

export function createAccessibilitySource(deps: {
  user: StoreLike<UserStoreState>;
  appearance?: StoreLike<Appearance> & { update?: (patch: Partial<Appearance>) => unknown };
  theme?: StoreLike<Appearance> & { update?: (patch: Partial<Appearance>) => unknown };
  store?: StoreLike<Appearance> & { update?: (patch: Partial<Appearance>) => unknown };
  updateAppearance?: (patch: Partial<Appearance>) => unknown;
}): RecordSource {
  const appearanceStore = resolveAppearanceStore(deps);
  const updateFn = deps.updateAppearance
    ?? (appearanceStore as unknown as { update?: (patch: Partial<Appearance>) => unknown }).update
    ?? updateAppearanceReal;

  return createStoreRecordSource<Appearance>({
    id: "settings:accessibility",
    label: "Accessibility",
    fields: ACCESSIBILITY_FIELDS,
    store: appearanceStore,
    read: (state) => {
      const userState = deps.user.getState();
      if (!userState.activeUserId) return null;
      const appearance = state ?? readCurrentAppearance();
      return {
        linkUnderline: appearance.linkUnderline ?? "default",
        motion: appearance.motion ?? "system",
        animatedImages: appearance.animatedImages ?? "play",
        hovercards: appearance.hovercards === "on",
        urlPaste: appearance.urlPaste ?? "link",
      };
    },
    isLoading: () => false,
    write: (patch) => {
      const field = Object.keys(patch)[0];
      const value = patch[field];
      if (field === "hovercards") {
        (updateFn as (patch: Partial<Appearance>) => unknown)({ hovercards: value ? "on" : "off" });
      } else {
        (updateFn as (patch: Partial<Appearance>) => unknown)({ [field]: value } as Partial<Appearance>);
      }
    },
  });
}
