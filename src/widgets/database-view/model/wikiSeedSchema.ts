/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wikiSeedSchema.ts                                   :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Schemas for the shared Delivery Wiki databases (notion-database-sys local
 * seed): `db-milestones` ↔ `db-wikifiles` are a two-way relation pair — Files
 * is a filesystem-style table where every entry has a Source (notes, docs,
 * images, …) and belongs to a milestone, so views can filter "the notes of
 * milestone X". Property shapes mirror the hardcoded notion-database-sys
 * seeds exactly (relationConfig / formulaConfig / rollupConfig / buttonConfig).
 */

import type { DatabaseSchema } from "@notion-db/contract-types";

export const WIKI_MILESTONES_DB_ID = "db-milestones";
export const WIKI_FILES_DB_ID = "db-wikifiles";

export const wikiMilestonesSchema: DatabaseSchema = {
  id: WIKI_MILESTONES_DB_ID,
  name: "Milestones",
  icon: "🎯",
  description: "Delivery milestones — each one collects the files and notes produced on the way.",
  titlePropertyId: "ms-title",
  properties: {
    "ms-title": { id: "ms-title", name: "Milestone", type: "title" },
    "ms-status": {
      id: "ms-status", name: "Status", type: "status",
      options: [
        { id: "mss-planned", value: "Planned", color: "bg-surface-muted text-ink-strong" },
        { id: "mss-flight", value: "In Flight", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "mss-risk", value: "At Risk", color: "bg-danger-surface-medium text-danger-text-tag" },
        { id: "mss-shipped", value: "Shipped", color: "bg-success-surface-medium text-success-text-tag" },
      ],
    },
    "ms-quarter": {
      id: "ms-quarter", name: "Quarter", type: "select",
      options: [
        { id: "msq-q1", value: "Q1", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "msq-q2", value: "Q2", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "msq-q3", value: "Q3", color: "bg-warning-surface-medium text-warning-text-tag" },
        { id: "msq-q4", value: "Q4", color: "bg-surface-muted text-ink-strong" },
      ],
    },
    "ms-owner": { id: "ms-owner", name: "Owner", type: "text" },
    "ms-start": { id: "ms-start", name: "Start", type: "date" },
    "ms-due": { id: "ms-due", name: "Due", type: "date" },
    "ms-files": {
      id: "ms-files", name: "Files", type: "relation",
      relationConfig: { databaseId: WIKI_FILES_DB_ID, type: "two_way", reversePropertyId: "wf-milestone" },
    },
    "ms-file-count": {
      id: "ms-file-count", name: "File Count", type: "rollup",
      rollupConfig: { relationPropertyId: "ms-files", targetPropertyId: "wf-title", function: "count_all", displayAs: "number" },
    },
    "ms-total-kb": {
      id: "ms-total-kb", name: "Total KB", type: "rollup",
      rollupConfig: { relationPropertyId: "ms-files", targetPropertyId: "wf-size", function: "sum", displayAs: "number" },
    },
    "ms-days-left": {
      id: "ms-days-left", name: "Days Left", type: "formula",
      formulaConfig: { expression: 'dateBetween(prop("Due"), now(), "days")' },
    },
    "ms-health": {
      id: "ms-health", name: "Health", type: "formula",
      formulaConfig: {
        expression: 'ifs(dateBetween(prop("Due"), now(), "days") < 0, "🔥 Overdue", dateBetween(prop("Due"), now(), "days") < 14, "⚠️ Tight", "🟢 On Track")',
      },
    },
    "ms-brief": {
      id: "ms-brief", name: "Brief", type: "button",
      buttonConfig: { label: "Open brief", action: "open_url", url: "https://localhost:3001/" },
    },
  },
};

export const wikiFilesSchema: DatabaseSchema = {
  id: WIKI_FILES_DB_ID,
  name: "Files",
  icon: "🗂️",
  description: "The workspace filesystem — every artifact has a Source (notes, docs, images, datasets) and belongs to a milestone.",
  titlePropertyId: "wf-title",
  properties: {
    "wf-title": { id: "wf-title", name: "File", type: "title" },
    "wf-source": {
      id: "wf-source", name: "Source", type: "select",
      options: [
        { id: "wfs-note", value: "Note", color: "bg-warning-surface-medium text-warning-text-tag" },
        { id: "wfs-doc", value: "Document", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "wfs-image", value: "Image", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "wfs-dataset", value: "Dataset", color: "bg-surface-muted text-ink-strong" },
        { id: "wfs-upload", value: "Upload", color: "bg-danger-surface-medium text-danger-text-tag" },
      ],
    },
    "wf-milestone": {
      id: "wf-milestone", name: "Milestone", type: "relation",
      relationConfig: { databaseId: WIKI_MILESTONES_DB_ID, type: "two_way", reversePropertyId: "ms-files", limit: 1 },
    },
    "wf-tags": {
      id: "wf-tags", name: "Tags", type: "multi_select",
      options: [
        { id: "wft-spec", value: "spec", color: "bg-accent-subtle text-accent-text-bold" },
        { id: "wft-research", value: "research", color: "bg-warning-surface-medium text-warning-text-tag" },
        { id: "wft-design", value: "design", color: "bg-success-surface-medium text-success-text-tag" },
        { id: "wft-meeting", value: "meeting", color: "bg-surface-muted text-ink-strong" },
        { id: "wft-retro", value: "retro", color: "bg-danger-surface-medium text-danger-text-tag" },
      ],
    },
    "wf-size": { id: "wf-size", name: "Size (KB)", type: "number" },
    "wf-modified": { id: "wf-modified", name: "Modified", type: "date" },
    "wf-owner": { id: "wf-owner", name: "Owner", type: "text" },
    "wf-pinned": { id: "wf-pinned", name: "Pinned", type: "checkbox" },
    "wf-weight": {
      id: "wf-weight", name: "Weight", type: "formula",
      formulaConfig: { expression: 'ifs(prop("Size (KB)") >= 4096, "🐘 Heavy", prop("Size (KB)") >= 512, "📦 Medium", "🍃 Light")' },
    },
    "wf-age": {
      id: "wf-age", name: "Age (days)", type: "formula",
      formulaConfig: { expression: 'dateBetween(now(), prop("Modified"), "days")' },
    },
    "wf-open": {
      id: "wf-open", name: "Open", type: "button",
      buttonConfig: { label: "Open", action: "open_url", url: "https://localhost:3001/" },
    },
  },
};
