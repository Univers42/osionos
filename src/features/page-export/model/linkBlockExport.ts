/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkBlockExport.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Export forms of an embed / bookmark block. The block is untrusted (a collaborator
// writes its JSON), so the URL goes through safeHttpUrl and the snapshot through
// parseEmbedSnapshot; an unsafe URL degrades to inert text, never an href or src.
//
// Caveat: the HTML iframe is what the exported file's reader's browser loads, so it is
// only as safe as the sandbox below; the exporter never fetches anything itself.

import type { Block } from "@/entities/block";
import { parseEmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import {
  EMBED_REFERRER_POLICY, THIRD_PARTY_SANDBOX, allowForPolicy, clampEmbedHeight, grantsFullscreen, safeAspect,
} from "@/shared/lib/embed/embedPolicy";
import { appForbiddenOrigins, displayHost, safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";
import { escapeLinkLabel } from "@/shared/lib/embed/linkLabel";
import { chooseEmbedView } from "@/shared/ui/embed/model/chooseEmbedView";

import { escapeHtml } from "./htmlEscape";

export const LINK_EXPORT_TYPES: ReadonlySet<string> = new Set(["embed", "bookmark"]);

interface LinkTarget {
  /** Safe absolute URL, or "" when the stored one must not be used. */
  href: string;
  title: string;
  description: string;
}

function linkTarget(block: Block): LinkTarget {
  const snapshot = parseEmbedSnapshot(block.embed);
  return {
    href: safeHttpUrl(block.content ?? ""),
    title: (snapshot?.title ?? "").replace(/\s+/g, " ").trim(),
    description: (snapshot?.description ?? "").replace(/\s+/g, " ").trim(),
  };
}

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** `[title or url](url)`; an unsafe URL stays plain text. */
export function linkBlockMarkdown(block: Block): string {
  const { href, title } = linkTarget(block);
  if (href === "") return oneLine(block.content ?? "");
  const label = escapeLinkLabel(title || href);
  return `[${label}](${href.replaceAll("(", "%28").replaceAll(")", "%29")})`;
}

/** One plain line for the PDF: the title and URL, or the stored text when unsafe. */
export function linkBlockPlainText(block: Block): string {
  const { href, title } = linkTarget(block);
  if (href === "") return oneLine(block.content ?? "");
  return title ? `${title} - ${href}` : href;
}

function linkHtml(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function framedHtml(block: Block, target: LinkTarget): string {
  const view = chooseEmbedView({ url: target.href, snapshot: parseEmbedSnapshot(block.embed), forbiddenOrigins: appForbiddenOrigins() });
  if (view.kind !== "frame" && view.kind !== "facade") return "";
  const src = view.kind === "frame" ? view.src : view.embed.src;
  const policy = view.kind === "facade" ? "provider" : view.policy;
  const aspect = view.aspect === undefined ? undefined : safeAspect(view.aspect);
  const height = aspect === undefined || block.embedHeight !== undefined ? clampEmbedHeight(block.embedHeight) : undefined;
  const box = height === undefined ? `aspect-ratio:${aspect}` : `height:${height}px`;
  return `<iframe src="${escapeHtml(src)}" title="${escapeHtml(target.title || displayHost(src))}" ` +
    `sandbox="${THIRD_PARTY_SANDBOX}" allow="${allowForPolicy(policy)}"${grantsFullscreen(policy) ? " allowfullscreen" : ""} ` +
    `referrerpolicy="${EMBED_REFERRER_POLICY}" loading="lazy" style="width:100%;border:0;${box}"></iframe>`;
}

/** embed: a sandboxed iframe (when the link is frameable) then a link; bookmark: a link card. */
export function linkBlockHtml(block: Block): string {
  const target = linkTarget(block);
  if (target.href === "") return `<p>${escapeHtml(oneLine(block.content ?? ""))}</p>`;
  if (block.type === "bookmark") {
    const description = target.description ? `<br><small>${escapeHtml(target.description)}</small>` : "";
    return `<p class="bookmark"><a href="${escapeHtml(target.href)}" rel="noopener noreferrer">` +
      `<strong>${escapeHtml(target.title || target.href)}</strong><br><small>${escapeHtml(displayHost(target.href))}</small>${description}</a></p>`;
  }
  const frame = framedHtml(block, target);
  return `${frame}<p>${linkHtml(target.href, target.title || target.href)}</p>`;
}
