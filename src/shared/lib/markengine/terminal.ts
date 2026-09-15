/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   terminal.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * ANSI terminal renderer. Pure, but split off the root entry point so web
 * consumers never bundle the ANSI tables.
 */

export { renderTerminal, type TerminalRenderOptions } from "./markdown/renderers/terminal";
export { getCalloutIcon as getCalloutIconForKind } from "./markdown/renderers/terminalHelpers";
