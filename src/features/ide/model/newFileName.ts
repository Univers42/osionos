/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   newFileName.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isPageFileName, PAGE_FILE_SUFFIX } from "./pageFileNames";
import { isCodeFileName } from "./ideLanguages";

/** The name the Explorer's "New file" creates. A typed name that is neither a page
 *  file nor a recognised code file is a page: "My notes" becomes `My notes.omd`
 *  instead of an extensionless code file that opens in the code editor. Only the
 *  Explorer calls this; the sandbox sync creates real files (README, LICENSE) as-is. */
export function nameForNewFile(name: string, plainFiles = false): string {
  // A folder on a computer has no pages: `Makefile` stays `Makefile`.
  if (plainFiles) return name;
  return isPageFileName(name) || isCodeFileName(name) ? name : name + PAGE_FILE_SUFFIX;
}
