/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileCodec.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import { FOLDER_META_NAME, PAGE_FILE_SUFFIX, type ParsedPageFile } from "./types";

// LANE I STUB — lane B (feat/ide-codec) implements pageToFile/fileToPage.

/** Any `.omd` name, the folder meta file included. */
export function isPageFileName(name: string): boolean {
  return name.toLowerCase().endsWith(PAGE_FILE_SUFFIX);
}

export function isFolderMetaName(name: string): boolean {
  return name === FOLDER_META_NAME;
}

/** The exact bytes a page is stored as: `.omd` text for block pages and folder
 *  meta, the raw code text (no front-matter) for `surface:"code"`. Deterministic:
 *  the same page always yields the same string (sha16 of it is the sync hash). */
export function pageToFile(page: PageEntry): string {
  throw new Error(`pageToFile(${page._id}): not implemented (lane B)`);
}

/** Parse `.omd` text. `existing` (the page the file's id resolves to) lends
 *  block ids by position when the overlay is missing. Never throws. */
export function fileToPage(text: string, existing?: PageEntry): ParsedPageFile {
  void existing;
  throw new Error(`fileToPage(${text.length} chars): not implemented (lane B)`);
}
