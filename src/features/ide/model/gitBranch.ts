/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gitBranch                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface GitBranchInfo {
  branch: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
}

export interface GitFileStatus {
  path: string;
  /** Two-char porcelain code (e.g. " M", "??", "A "). */
  code: string;
}

const HEADER = "## ";
const NO_COMMITS = "No commits yet on ";
const AHEAD = /[[ ]ahead (\d+)/;
const BEHIND = /[[ ]behind (\d+)/;

function countOf(header: string, pattern: RegExp): number {
  const match = pattern.exec(header);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

/**
 * Parses the `## …` header of `git status --porcelain -b`:
 * `<branch>[...<upstream>][ [ahead N][, behind M] | [gone]]`. A branch name never holds a space
 * or "..." (git refuses both), so the name is everything before the first of them. The exec runs
 * with a TTY, hence the `\r`. O(length of the first line).
 */
export function parseGitBranch(output: string): GitBranchInfo {
  const end = output.indexOf("\n");
  const first = (end === -1 ? output : output.slice(0, end)).replace(/\r$/, "");
  if (!first.startsWith(HEADER)) return { branch: null, ahead: 0, behind: 0, detached: false };
  const header = first.slice(HEADER.length);
  if (header.startsWith("HEAD (no branch)")) return { branch: null, ahead: 0, behind: 0, detached: true };
  const named = header.startsWith(NO_COMMITS) ? header.slice(NO_COMMITS.length) : header;
  const branch = (named.split(" ")[0] ?? "").split("...")[0] ?? "";
  return { branch: branch || null, ahead: countOf(header, AHEAD), behind: countOf(header, BEHIND), detached: false };
}

/** `git status --porcelain [-b]` → changed files; the `## ` branch header is not a file. O(n). */
export function parseGitStatus(output: string): GitFileStatus[] {
  const files: GitFileStatus[] = [];
  for (const line of output.split("\n")) {
    if (line.length < 4 || line.startsWith(HEADER)) continue;
    files.push({ code: line.slice(0, 2), path: line.slice(3).trim() });
  }
  return files;
}
