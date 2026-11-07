/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdownPreview.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/06 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/06 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isPageFileName } from "./pageFileNames";

export type PreviewFlavor = "omd" | "markdown";

/** Null means no preview; a page-file name takes precedence over the language. */
export function previewFlavorOf(fileName: string, languageId: string): PreviewFlavor | null {
  if (isPageFileName(fileName)) return "omd";
  if (languageId === "markdown") return "markdown";
  return null;
}
