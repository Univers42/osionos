/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserBlockNested.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:23:12 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:23:13 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — recursive block parsers (blockquote, callout, lists, footnotes)
// Barrel re-export: split into parserBlockQuote, parserBlockList, parserBlockFootnote
export type { ParseBlocksFn } from "./parserBlockQuote";
export { parseBlockquote, parseCallout, parseToggle } from "./parserBlockQuote";
export {
  parseTaskList,
  parseOrderedList,
  parseUnorderedList,
} from "./parserBlockList";
export { parseFootnoteDef } from "./parserBlockFootnote";
