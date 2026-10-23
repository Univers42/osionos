/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationSection.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import ModerationPanel from "../sections/moderation/ModerationPanel";
import { ModerationQueue } from "./ModerationQueue";

const REGION = "mt-8 first:mt-0";
const HEADING = "text-base font-semibold text-[var(--osio-fg-default)]";

/** The moderator's whole view, two named regions: the comments the filter held and the reports
 *  filed about people. The server gates each request; this only arranges them. */
export const ModerationSection: React.FC = () => (
  <>
    <section aria-labelledby="moderation-content-heading" className={REGION}>
      <h2 id="moderation-content-heading" className={HEADING}>Content held for review</h2>
      <ModerationQueue />
    </section>
    <section aria-labelledby="moderation-people-heading" className={REGION}>
      <h2 id="moderation-people-heading" className={HEADING}>Reports about people</h2>
      <ModerationPanel />
    </section>
  </>
);

export default ModerationSection;
