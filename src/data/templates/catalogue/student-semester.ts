/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   student-semester.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { twoSidebarsShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, mergeSlices, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `student-semester-${suffix}`;
const ASSIGNMENTS = key("db-assignments");
const COURSES = key("db-courses");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Assignments", "count"),
  statTile(key("w-average"), key("v-table"), "Average grade", "avg", key("p-grade")),
  statTile(key("w-best"), key("v-table"), "Best grade", "max", key("p-grade")),
  statTile(key("w-courses"), key("v-table"), "Courses in use", "distinct", key("p-course")),
]);

const assignmentViews = [
  view(key("v-calendar"), ASSIGNMENTS, "Due dates", "calendar", { showCalendarBy: key("p-due"), showCalendarAs: "month" }),
  { ...view(key("v-board"), ASSIGNMENTS, "Assignments by course", "board"), grouping: { propertyId: key("p-course") } },
  view(key("v-table"), ASSIGNMENTS, "All assignments", "table"),
  view(key("v-dashboard"), ASSIGNMENTS, "Semester overview", "dashboard", dashboardSettings([overview])),
];

const assignmentRows = [
  record(key("r-essay"), ASSIGNMENTS, {
    [key("p-title")]: "Write the French Revolution essay", [key("p-course")]: key("opt-history"),
    [key("p-kind")]: key("opt-essay"), [key("p-due")]: "2026-11-13T16:00:00.000Z",
    [key("p-grade")]: 88, [key("p-done")]: true,
  }),
  record(key("r-algebra"), ASSIGNMENTS, {
    [key("p-title")]: "Complete the algebra problem set", [key("p-course")]: key("opt-mathematics"),
    [key("p-kind")]: key("opt-homework"), [key("p-due")]: "2026-11-16T15:00:00.000Z",
    [key("p-grade")]: 92, [key("p-done")]: true,
  }),
  record(key("r-lab"), ASSIGNMENTS, {
    [key("p-title")]: "Prepare the cell division lab", [key("p-course")]: key("opt-biology"),
    [key("p-kind")]: key("opt-lab"), [key("p-due")]: "2026-11-24T10:00:00.000Z",
    [key("p-done")]: false,
  }),
  record(key("r-reading"), ASSIGNMENTS, {
    [key("p-title")]: "Annotate chapters four and five", [key("p-course")]: key("opt-literature"),
    [key("p-kind")]: key("opt-homework"), [key("p-due")]: "2026-11-25T09:00:00.000Z",
    [key("p-done")]: false,
  }),
  record(key("r-exam"), ASSIGNMENTS, {
    [key("p-title")]: "Take the modern history exam", [key("p-course")]: key("opt-history"),
    [key("p-kind")]: key("opt-exam"), [key("p-due")]: "2026-11-27T13:00:00.000Z",
    [key("p-done")]: false,
  }),
  record(key("r-photosynthesis"), ASSIGNMENTS, {
    [key("p-title")]: "Present the photosynthesis results", [key("p-course")]: key("opt-biology"),
    [key("p-kind")]: key("opt-lab"), [key("p-due")]: "2026-11-18T11:00:00.000Z",
    [key("p-grade")]: 95, [key("p-done")]: true,
  }),
];

const assignments = database({
  id: ASSIGNMENTS, name: "Assignments", icon: "📝",
  properties: [
    { id: key("p-title"), name: "Assignment", type: "title" },
    selectProperty(key("p-course"), "Course", [
      [key("opt-biology"), "Biology", "green"], [key("opt-history"), "History", "orange"],
      [key("opt-mathematics"), "Mathematics", "blue"], [key("opt-literature"), "Literature", "purple"],
    ]),
    selectProperty(key("p-kind"), "Kind", [
      [key("opt-homework"), "Homework", "gray"], [key("opt-essay"), "Essay", "purple"],
      [key("opt-exam"), "Exam", "red"], [key("opt-lab"), "Lab", "green"],
    ]),
    { id: key("p-due"), name: "Due date", type: "date" },
    { id: key("p-grade"), name: "Grade", type: "number" },
    { id: key("p-done"), name: "Done", type: "checkbox" },
  ],
  views: assignmentViews, rows: assignmentRows,
});

const courses = database({
  id: COURSES, name: "Courses", icon: "🎓",
  properties: [
    { id: key("p-course-title"), name: "Course", type: "title" },
    { id: key("p-credits"), name: "Credits", type: "number" },
    { id: key("p-teacher"), name: "Teacher", type: "text" },
    { id: key("p-room"), name: "Room", type: "text" },
  ],
  views: [view(key("v-courses-table"), COURSES, "Course schedule", "table")],
  rows: [
    record(key("r-course-biology"), COURSES, {
      [key("p-course-title")]: "Biology", [key("p-credits")]: 4, [key("p-teacher")]: "Sam", [key("p-room")]: "Lab 2",
    }),
    record(key("r-course-history"), COURSES, {
      [key("p-course-title")]: "History", [key("p-credits")]: 3, [key("p-teacher")]: "Alex", [key("p-room")]: "Room 204",
    }),
    record(key("r-course-mathematics"), COURSES, {
      [key("p-course-title")]: "Mathematics", [key("p-credits")]: 4, [key("p-teacher")]: "Priya", [key("p-room")]: "Room 110",
    }),
    record(key("r-course-literature"), COURSES, {
      [key("p-course-title")]: "Literature", [key("p-credits")]: 3, [key("p-teacher")]: "Noor", [key("p-room")]: "Room 308",
    }),
  ],
});

const template: TemplateBody = {
  content: scopeIds(regionPage(twoSidebarsShell, {
    header: [
      heading(key("h-title"), "Student semester", 1),
      p("See every deadline, course, and grade together so the next study session always has a clear focus."),
    ],
    left: [
      heading(key("h-courses"), "Course load", 2),
      p("Keep credits, teachers, and rooms beside your assignments for quick reference throughout the term."),
      dbInline(COURSES, key("v-courses-table")),
    ],
    main: [dbInline(ASSIGNMENTS, key("v-dashboard")), dbInline(ASSIGNMENTS, key("v-calendar")), dbInline(ASSIGNMENTS, key("v-board"))],
    right: [
      heading(key("h-details"), "Assignment details", 2),
      p("Mark finished work done and record grades here to keep the semester summary current."),
      dbInline(ASSIGNMENTS, key("v-table")),
    ],
  }), "student-semester"),
  databases: mergeSlices(assignments, courses),
};

export default template;
