/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   starterKits.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Per-intent starter content for a new workspace, mirroring Notion's work /
 *  personal / school onboarding. Built from the shared seed block builders. */

import { bullet, callout, divider, h1, h2, p, todo, toggle } from "@/data/seedBlockHelpers";
import type { Block } from "@/entities/block";

export type WorkspaceIntent = "work" | "personal" | "school";

interface StarterPage {
  title: string;
  icon: string;
  content: Block[];
}

export interface StarterKit {
  defaultName: string;
  withCalendar: boolean;
  pages: StarterPage[];
}

export const STARTER_KITS: Record<WorkspaceIntent, StarterKit> = {
  work: {
    defaultName: "Work",
    withCalendar: true,
    pages: [
      { title: "Getting Started", icon: "🚀", content: [
        h1("Welcome to your work space"),
        callout("Track projects, company goals, and meeting notes — all in one place.", "👋"),
        p("Open a starter page on the left, or press the + to make your own."),
      ] },
      { title: "Projects", icon: "📋", content: [
        h1("Projects"), h2("In progress"),
        todo("Kick off the Q3 roadmap"), todo("Draft the launch plan"),
        h2("Backlog"), todo("Research competitor pricing"), todo("Interview 3 customers"),
      ] },
      { title: "Company Goals", icon: "🎯", content: [
        h1("Company Goals"), h2("This quarter"),
        todo("Grow active users by 20%"), todo("Ship the new onboarding"), todo("Close 3 enterprise deals"),
      ] },
      { title: "Meeting Notes", icon: "📝", content: [
        h1("Meeting Notes"), p("Date:"), p("Attendees:"),
        h2("Agenda"), bullet("Topic one"), bullet("Topic two"),
        h2("Action items"), todo("Owner — follow up"),
      ] },
    ],
  },
  personal: {
    defaultName: "Personal",
    withCalendar: true,
    pages: [
      { title: "Home", icon: "🏡", content: [
        h1("Your personal space"),
        callout("Write better, think more clearly, and stay organized.", "🌱"),
        p("A calm home for your tasks, notes, and ideas."),
      ] },
      { title: "Tasks", icon: "✅", content: [
        h1("Tasks"), h2("Today"), todo("Plan the week"),
        h2("This week"), todo("Book the dentist"), todo("Reply to emails"),
      ] },
      { title: "Reading List", icon: "📖", content: [
        h1("Reading List"),
        todo("Atomic Habits — James Clear"), todo("Deep Work — Cal Newport"),
        todo("Add a book you want to read"),
      ] },
      { title: "Journal", icon: "🧠", content: [
        h1("Journal"), p("What's on your mind today?"), divider(),
        h2("Three things I'm grateful for"), bullet(""), bullet(""), bullet(""),
      ] },
    ],
  },
  school: {
    defaultName: "School",
    withCalendar: true,
    pages: [
      { title: "School Dashboard", icon: "🎓", content: [
        h1("School Dashboard"),
        callout("Keep notes, research, and tasks in one place.", "📓"),
        p("Everything for this semester, organized."),
      ] },
      { title: "Class Notes", icon: "📚", content: [
        h1("Class Notes"),
        toggle("Lecture 1 — Introduction", [p("Key ideas…")]),
        toggle("Lecture 2 — Fundamentals", [p("Key ideas…")]),
      ] },
      { title: "Assignments", icon: "📅", content: [
        h1("Assignments"), h2("Due soon"), todo("Essay draft"), todo("Problem set 3"),
        h2("Upcoming"), todo("Group project checkpoint"),
      ] },
      { title: "Research", icon: "🔬", content: [
        h1("Research"), h2("Topic"), p("Your question…"),
        h2("Sources"), bullet("Source one"), bullet("Source two"),
      ] },
    ],
  },
};
