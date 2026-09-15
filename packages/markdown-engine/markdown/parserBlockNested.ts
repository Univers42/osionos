/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserBlockNested.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
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
