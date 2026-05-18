/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   check-parser-coverage.cjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const fs = require("node:fs");
const path = require("node:path");

const summaryPath = path.resolve(__dirname, "../coverage/coverage-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const requiredBranches = 95;
const parserFiles = ["src/block-parser.ts", "src/inline-parser.ts"];
const failures = [];

for (const parserFile of parserFiles) {
  const entry = Object.entries(summary).find(([filePath]) =>
    filePath.replaceAll(path.sep, "/").endsWith(parserFile),
  );
  if (!entry) {
    failures.push(`${parserFile}: missing coverage entry`);
    continue;
  }

  const branchCoverage = entry[1].branches.pct;
  if (branchCoverage < requiredBranches) {
    failures.push(
      `${parserFile}: branch coverage ${branchCoverage}% is below ${requiredBranches}%`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`parser branch coverage: ${requiredBranches}% gate passed`);