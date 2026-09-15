/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   check-quality-gates.cjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredDirectories = new Set([
  ".git",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(path.join(directory, entry.name), files);
      }
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function lineAndColumn(sourceFile, position) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return `${line + 1}:${character + 1}`;
}

function hasExampleJSDoc(sourceText, node) {
  const ranges = ts.getLeadingCommentRanges(sourceText, node.pos) ?? [];
  const last = ranges.at(-1);
  if (!last) return false;
  const comment = sourceText.slice(last.pos, last.end);
  const between = sourceText.slice(last.end, node.getStart()).trim();
  return between.length === 0 && comment.startsWith("/**") && comment.includes("@example");
}

const failures = [];

for (const filePath of walk(root)) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (sourceText.includes("eslint-disable")) {
    failures.push(`${relative(filePath)} contains eslint-disable`);
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      failures.push(
        `${relative(filePath)}:${lineAndColumn(sourceFile, node.getStart())} uses explicit any`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (relative(filePath) === "index.ts") {
    for (const statement of sourceFile.statements) {
      const isPublicExport =
        ts.isExportDeclaration(statement) ||
        ((ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isVariableStatement(statement)) &&
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ));

      if (isPublicExport && !hasExampleJSDoc(sourceText, statement)) {
        failures.push(
          `index.ts:${lineAndColumn(sourceFile, statement.getStart())} export is missing JSDoc @example`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("quality gates: no explicit any, no eslint-disable, public exports documented");