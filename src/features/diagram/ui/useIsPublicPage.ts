/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIsPublicPage.ts                                    +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Is this document a published page?
 *
 * The public view is mounted on `/p/:token` before the app (src/app/main.tsx)
 * and never changes route afterwards, so the answer is read once and kept.
 */

import { useState } from "react";

import { isPublicPage } from "../model/publicPageSignal";

/** True when the block is rendered on a published page (devil C110). */
export function useIsPublicPage(): boolean {
  const [isPublic] = useState(() => isPublicPage());
  return isPublic;
}
