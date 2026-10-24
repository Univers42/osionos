/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assistant-handoff.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The hand-off from an image to the Assistant.
 *
 * Only an image the service will read is handed over — the path of an upload
 * of this workspace — and the hand-off is taken once: the composer never sees
 * the same picture twice, and the state never leaves the memory.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaPathOfAsset,
  mergeAttachments,
  useAssistantHandoff,
} from "@/features/chat/model/assistantHandoff";

/* -------------------------------------------------------------------------- */
/* The fixtures                                                               */
/* -------------------------------------------------------------------------- */

/** The bridge of the app. */
const BASE = "https://api.example";

/** The uuid of an upload (36 characters) and the sha256 of its bytes (64). */
const UUID = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SHA = "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0";

/** The path of a stored image — the only shape the service reads. */
const PATH = `/api/media/uploads/${UUID}/${SHA}.png`;

/** Another stored image, of another upload. */
const OTHER_PATH = `/api/media/uploads/11111111-2222-3333-4444-555555555555/${SHA}.jpg`;

/** The store starts empty: a hand-off of another test must not leak. */
function resetHandoff(): void {
  useAssistantHandoff.setState({ pending: null });
}

/* -------------------------------------------------------------------------- */
/* The path of a stored image                                                 */
/* -------------------------------------------------------------------------- */

test("the asset of an AI image is the path the service reads", () => {
  assert.equal(mediaPathOfAsset(`url:${BASE}${PATH}`, BASE), PATH);
});

test("the same asset without its prefix is the path too", () => {
  assert.equal(mediaPathOfAsset(`${BASE}${PATH}`, BASE), PATH);
});

test("a relative path is the path already", () => {
  assert.equal(mediaPathOfAsset(PATH, BASE), PATH);
});

test("a data: URL is nothing", () => {
  assert.equal(mediaPathOfAsset("data:image/png;base64,iVBORw0KGgo=", BASE), null);
});

test("an external image is nothing", () => {
  assert.equal(mediaPathOfAsset("https://images.unsplash.com/x.jpg", BASE), null);
});

test("a gallery picture is nothing", () => {
  assert.equal(mediaPathOfAsset("url:data:image/png;base64,iVBORw0KGgo=", BASE), null);
  assert.equal(mediaPathOfAsset("ui:icon:star", BASE), null);
});

test("a path that walks out of the upload is nothing", () => {
  assert.equal(mediaPathOfAsset(`/api/media/uploads/${UUID}/../x.png`, BASE), null);
});

test("another shape of /api/media is nothing", () => {
  assert.equal(mediaPathOfAsset(`/api/media/other/${UUID}/${SHA}.png`, BASE), null);
});

test("the base of another host never gives the path away", () => {
  assert.equal(mediaPathOfAsset(`url:${BASE}${PATH}`, "https://other.example"), null);
});

test("no asset at all is nothing", () => {
  assert.equal(mediaPathOfAsset(undefined, BASE), null);
  assert.equal(mediaPathOfAsset("", BASE), null);
});

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

test("a hand-off is taken once, and only once", () => {
  resetHandoff();
  useAssistantHandoff.getState().handOff({ attachments: [PATH], text: "" });

  const taken = useAssistantHandoff.getState().take();
  assert.deepEqual(taken, { attachments: [PATH], text: "" });
  assert.equal(useAssistantHandoff.getState().take(), null);
  assert.equal(useAssistantHandoff.getState().pending, null);
});

test("the hand-off is memory only: nothing reaches the storage", () => {
  resetHandoff();
  const writes: string[] = [];
  const storage = {
    getItem: () => null,
    setItem: (key: string, value: string) => { writes.push(`${key}=${value}`); },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    useAssistantHandoff.getState().handOff({ attachments: [PATH], text: "" });
    assert.deepEqual(writes, [], "the hand-off must not be written anywhere");
    assert.deepEqual(useAssistantHandoff.getState().pending?.attachments, [PATH]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    resetHandoff();
  }
});

/* -------------------------------------------------------------------------- */
/* The attachments of the composer                                            */
/* -------------------------------------------------------------------------- */

test("the composer takes the picture once, and never more than it holds", () => {
  assert.deepEqual(mergeAttachments([], [PATH], 4), [PATH]);
  assert.deepEqual(mergeAttachments([PATH], [PATH], 4), [PATH]);
  assert.deepEqual(mergeAttachments([PATH], [OTHER_PATH], 4), [PATH, OTHER_PATH]);
  assert.deepEqual(mergeAttachments([PATH, OTHER_PATH], ["/api/media/third.png"], 2), [
    PATH,
    OTHER_PATH,
  ]);
});
