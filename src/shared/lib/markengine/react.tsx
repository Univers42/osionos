/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   react.tsx                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * React renderers — the ONLY entry point that pulls in React.
 *
 * This split is load-bearing, not cosmetic: the root barrel must stay
 * React-free so `node --test --experimental-strip-types` can load the engine.
 * React is a peer dependency, supplied by the host.
 */

export {
  MarkdownView,
  renderReact,
  type ReactRenderOptions,
} from "./markdown/renderers/react";

export { renderInlineToReact } from "./markdown/shortcutsReact";
