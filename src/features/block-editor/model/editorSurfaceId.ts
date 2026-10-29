/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editorSurfaceId.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext } from "react";

/** Identifies one mounted editor surface. Two panes showing the same page share block ids,
 *  so per-block transient state (the slash dialog request) is keyed by this as well. */
export const EditorSurfaceIdContext = createContext("");
