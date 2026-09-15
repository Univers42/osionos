/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmojiPicker.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Historical name kept for its call sites (page icons, callouts, workspace icon). It now renders
// the rebuilt IconPicker — Emoji · Icons (lucide) · Custom SVG, with a per-asset color — so the
// whole app's icon picking upgrades through this one alias. Same props (current/onSelect/onRemove/
// onClose), so no call site changes. Render the value with <IconValueView/> to show icon/SVG/color.
export { IconPicker as EmojiPicker } from "../IconPicker";
