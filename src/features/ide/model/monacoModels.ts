/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoModels.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { editor, Uri } from "./monacoRuntime";

// Monaco keeps ONE text model per URI process-wide and throws on a duplicate
// create. Two things hit that: React StrictMode's dev double-mount, and the same
// page open in two panes. So models are acquired by URI with a reference count:
// the first acquire creates, later ones share the live (already edited) model,
// and only the last release disposes — the classic Monaco leak is a model that
// outlives every editor, the classic crash is a model disposed under one.
//
// `ownerId` (the page id) guards the one case sharing would be WRONG: two
// different pages whose titles map to the same workspace path. They get a
// disambiguated URI instead of each other's text.
const entries = new Map<string, { refs: number; owner: string }>();

export function acquireModel(uriString: string, text: string, languageId: string, ownerId: string): editor.ITextModel {
  let uri = Uri.parse(uriString);
  const clash = entries.get(uri.toString());
  if (clash && clash.owner !== ownerId) uri = uri.with({ query: `page=${ownerId}` });
  const key = uri.toString();
  const model = editor.getModel(uri) ?? editor.createModel(text, languageId, uri);
  const entry = entries.get(key) ?? { refs: 0, owner: ownerId };
  entry.refs += 1;
  entries.set(key, entry);
  return model;
}

export function releaseModel(model: editor.ITextModel): void {
  const key = model.uri.toString();
  const entry = entries.get(key);
  if (entry && entry.refs > 1) { entry.refs -= 1; return; }
  entries.delete(key);
  if (!model.isDisposed()) model.dispose();
}
