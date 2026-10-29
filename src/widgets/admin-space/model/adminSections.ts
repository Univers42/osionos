/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   adminSections.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ComponentType } from "react";
import { FileText, ShieldAlert, type LucideIcon } from "lucide-react";

import { roleAtLeast, type PlatformRole } from "@/features/auth/model/platformRole";

export interface AdminSection {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** The lowest platform role that may open the section. */
  requiredRole: PlatformRole;
  load: () => Promise<{ default: ComponentType }>;
}

/** The sections the shell ships with. Later sections arrive as
 *  `sections/<id>/section.ts` and are found by `discoveredSections.ts`. */
export const BUILT_IN_SECTIONS: readonly AdminSection[] = [
  { id: "templates", label: "Templates", Icon: FileText, requiredRole: "admin", load: () => import("../ui/TemplatesSection") },
  { id: "moderation", label: "Moderation", Icon: ShieldAlert, requiredRole: "moderator", load: () => import("../ui/ModerationSection") },
];

/** The sections a role may open. Cosmetic: the bridge re-checks every request.
 *  An unknown role (null) keeps nothing — a caller that cannot name a role is not let in. */
export function visibleSections(sections: readonly AdminSection[], role: PlatformRole | null): AdminSection[] {
  return sections.filter((section) => roleAtLeast(role, section.requiredRole));
}
