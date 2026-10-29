/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   professionProfiles.ts                              ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profile template of every profession. A profession is a code definition, not a
 * page: nothing here is stored, seeded or rendered until a member picks a profession.
 */

import type { Block } from "@/entities/block";
import type { ProfessionId } from "./professions";
import { creatorProfileContent } from "./creatorProfile";
import { dataAnalystProfileContent } from "./dataAnalystProfile";
import { developerProfileContent } from "./developerProfile";
import { designerProfileContent } from "./designerProfile";
import { founderProfileContent } from "./founderProfile";
import { researcherProfileContent } from "./researcherProfile";
import { studentProfileContent } from "./studentProfile";
import { teacherProfileContent } from "./teacherProfile";

const PROFILE_BUILDERS: Record<ProfessionId, () => Block[]> = {
  student: studentProfileContent,
  developer: developerProfileContent,
  designer: designerProfileContent,
  "data-analyst": dataAnalystProfileContent,
  researcher: researcherProfileContent,
  creator: creatorProfileContent,
  founder: founderProfileContent,
  teacher: teacherProfileContent,
};

/**
 * The profile blocks of a profession: the three bound groups every profile shell opens
 * with (header, about, details) followed by the profession's own section.
 */
export function professionProfileContent(id: ProfessionId): Block[] {
  // The id reaches the app from the server (the profile card), so the type is a promise,
  // not a guarantee: an unknown id builds nothing instead of throwing.
  const build = PROFILE_BUILDERS[id];
  return build ? build() : [];
}
