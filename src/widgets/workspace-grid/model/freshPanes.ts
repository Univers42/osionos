/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   freshPanes.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Panes a drop or a split just made, so their PaneView grows in once. Kept outside the
// persisted layout: a pane restored from storage or rebuilt by a reload must not animate.
const freshPaneIds = new Set<string>();

export const markFreshPane = (paneId: string) => {
  freshPaneIds.add(paneId);
};

export const isFreshPane = (paneId: string) => freshPaneIds.has(paneId);

export const forgetFreshPane = (paneId: string) => {
  freshPaneIds.delete(paneId);
};
