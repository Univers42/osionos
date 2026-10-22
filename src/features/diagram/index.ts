/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                            +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The living-diagram compiler (Plan D34, devil C108, C109, C110).
 *
 * A diagram is a SPEC plus the data the viewer can already read. The spec is
 * closed (diagramSpec.ts), the data becomes an IR (compile.ts), and the IR
 * becomes mermaid text (toMermaid.ts) that the ONE locked renderer draws.
 */

export * from "./model/diagramSpec";
export * from "./model/diagramIR";
export * from "./model/diagramSource";
export * from "./model/compile";
export * from "./model/toMermaid";
export * from "./model/hierarchyInput";
export * from "./model/databaseInput";
export * from "./model/databaseSource";
export * from "./model/diagramRenderMode";
export * from "./model/diagramMarkdown";
export * from "./model/publicPageSignal";
