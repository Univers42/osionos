/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   professions.ts                                     ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The eight professions a member can pick. This is a catalogue, not a registry of
 * pages: a profession is a code definition with two builders (the profile template
 * and the Home seed), never a stored page and never a template surface.
 */

export type ProfessionId =
  | "student"
  | "developer"
  | "designer"
  | "data-analyst"
  | "researcher"
  | "creator"
  | "founder"
  | "teacher";

export interface Profession {
  id: ProfessionId;
  label: string;
  icon: string;
  desc: string;
}

export const PROFESSIONS: Profession[] = [
  { id: "student", label: "Student", icon: "🎓", desc: "Courses, assignments and study notes in one place" },
  { id: "developer", label: "Developer", icon: "💻", desc: "Projects, issues and releases side by side" },
  { id: "designer", label: "Designer", icon: "🎨", desc: "Portfolio, assets and design reviews" },
  { id: "data-analyst", label: "Data analyst", icon: "📊", desc: "Dashboards, datasets and analysis notes" },
  { id: "researcher", label: "Researcher", icon: "🔬", desc: "Sources, literature notes and findings" },
  { id: "creator", label: "Creator", icon: "✨", desc: "Content calendar, drafts and published work" },
  { id: "founder", label: "Founder", icon: "🚀", desc: "Roadmap, milestones and company goals" },
  { id: "teacher", label: "Teacher", icon: "🧑‍🏫", desc: "Classes, gradebooks and lesson materials" },
];

const PROFESSION_IDS = new Set<string>(PROFESSIONS.map((profession) => profession.id));

/** The one guard a profession id passes before it reaches a builder. */
export function isProfessionId(value: unknown): value is ProfessionId {
  return typeof value === "string" && PROFESSION_IDS.has(value);
}
