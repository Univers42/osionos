/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideLanguages.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The IDE language registry — one record per language. It drives four things:
 * syntax highlighting (`monacoId`, resolved to a lazily loaded grammar by
 * monacoLanguages.ts), the tab icon accent, whether the runner can execute it
 * (`runnable` + `runCmd`, read by P3), and which formatter to use (`formatterId`,
 * read by P4). Adding a language = one record here (+ its toolchain in the
 * runner image if runnable). This file stays dependency-free ON PURPOSE: the
 * sidebar reads languageForFileName() for the file-dot color, and a module-scope
 * editor import here once rode that call into the entry chunk and dragged the
 * whole editor core into first paint. The grammar loaders live in
 * monacoLanguages.ts behind a dynamic import.
 *
 * `runCmd` uses `{file}` as the source-path placeholder; it is DATA consumed by
 * the sandboxed runner (P3), never executed client-side.
 *
 * ponytail: ~35 languages. Monaco ships ~80 Monarch grammars — extend by adding
 * one record here and its loader in monacoLanguages.ts (or a Monarch definition
 * in ideMonarch.ts when Monaco has none).
 */
export interface IdeLanguage {
  /** Canonical id (the IDE's own language key). */
  id: string;
  label: string;
  /** File extensions (lowercase, no dot) that map to this language. */
  extensions: string[];
  /** The Monaco language id whose grammar highlights it (see monacoLanguages.ts). */
  monacoId: string;
  /** Brand accent (hex) for the file-tab dot + status bar — language identity,
   *  not a theme color, so a literal hex is correct (like the code-card dots). */
  accent: string;
  /** P3: can the sandboxed runner execute a file of this language. */
  runnable: boolean;
  /** P3: how the runner runs it (`{file}` = source path). Compiled langs compile
   *  then run in one shell line. Absent when not runnable. */
  runCmd?: string;
  /** P4: which formatter formats it. Absent when we have no formatter wired. */
  formatterId?: "prettier" | "black" | "clang-format" | "gofmt" | "rustfmt" | "google-java-format" | "shfmt";
}

export const IDE_LANGUAGES: IdeLanguage[] = [
  { id: "python", label: "Python", extensions: ["py", "pyw", "pyi"], accent: "#3572A5", runnable: true, runCmd: "python3 {file}", formatterId: "black", monacoId: "python" },
  { id: "c", label: "C", extensions: ["c", "h"], accent: "#555555", runnable: true, runCmd: "gcc -O2 -std=c17 -o /tmp/a.out {file} && /tmp/a.out", formatterId: "clang-format", monacoId: "c" },
  { id: "cpp", label: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "hxx", "h++", "ipp"], accent: "#f34b7d", runnable: true, runCmd: "g++ -O2 -std=c++20 -o /tmp/a.out {file} && /tmp/a.out", formatterId: "clang-format", monacoId: "cpp" },
  { id: "java", label: "Java", extensions: ["java"], accent: "#b07219", runnable: true, runCmd: "cd /tmp && cp {file} Main.java && javac Main.java && java Main", formatterId: "google-java-format", monacoId: "java" },
  { id: "javascript", label: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"], accent: "#f1e05a", runnable: true, runCmd: "node {file}", formatterId: "prettier", monacoId: "javascript" },
  { id: "typescript", label: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"], accent: "#3178c6", runnable: true, runCmd: "node --experimental-strip-types {file}", formatterId: "prettier", monacoId: "typescript" },
  { id: "rust", label: "Rust", extensions: ["rs"], accent: "#dea584", runnable: true, runCmd: "rustc -O -o /tmp/a.out {file} && /tmp/a.out", formatterId: "rustfmt", monacoId: "rust" },
  { id: "go", label: "Go", extensions: ["go"], accent: "#00ADD8", runnable: true, runCmd: "go run {file}", formatterId: "gofmt", monacoId: "go" },
  { id: "php", label: "PHP", extensions: ["php"], accent: "#4F5D95", runnable: true, runCmd: "php {file}", formatterId: "prettier", monacoId: "php" },
  { id: "sql", label: "SQL", extensions: ["sql"], accent: "#e38c00", runnable: false, formatterId: "prettier", monacoId: "sql" },
  { id: "html", label: "HTML", extensions: ["html", "htm", "xhtml"], accent: "#e34c26", runnable: false, formatterId: "prettier", monacoId: "html" },
  { id: "css", label: "CSS", extensions: ["css", "scss", "sass", "less"], accent: "#563d7c", runnable: false, formatterId: "prettier", monacoId: "css" },
  { id: "json", label: "JSON", extensions: ["json", "jsonc", "json5"], accent: "#cbcb41", runnable: false, formatterId: "prettier", monacoId: "json" },
  { id: "markdown", label: "Markdown", extensions: ["md", "markdown", "mdx"], accent: "#083fa1", runnable: false, formatterId: "prettier", monacoId: "markdown" },
  { id: "xml", label: "XML", extensions: ["xml", "svg", "xsl", "plist"], accent: "#0060ac", runnable: false, formatterId: "prettier", monacoId: "xml" },
  { id: "yaml", label: "YAML", extensions: ["yml", "yaml"], accent: "#cb171e", runnable: false, formatterId: "prettier", monacoId: "yaml" },
  // --- the long tail (Monaco Monarch grammars, or ideMonarch.ts when Monaco has none) ---
  { id: "shell", label: "Shell", extensions: ["sh", "bash", "zsh", "ksh", "command"], accent: "#89e051", runnable: true, runCmd: "bash {file}", formatterId: "shfmt", monacoId: "shell" },
  { id: "ruby", label: "Ruby", extensions: ["rb", "rake", "gemspec"], accent: "#701516", runnable: true, runCmd: "ruby {file}", monacoId: "ruby" },
  { id: "lua", label: "Lua", extensions: ["lua"], accent: "#000080", runnable: true, runCmd: "lua {file}", monacoId: "lua" },
  { id: "perl", label: "Perl", extensions: ["pl", "pm"], accent: "#0298c3", runnable: true, runCmd: "perl {file}", monacoId: "perl" },
  { id: "r", label: "R", extensions: ["r"], accent: "#198CE7", runnable: true, runCmd: "Rscript {file}", monacoId: "r" },
  { id: "haskell", label: "Haskell", extensions: ["hs"], accent: "#5e5086", runnable: true, runCmd: "runghc {file}", monacoId: "haskell" },
  { id: "clojure", label: "Clojure", extensions: ["clj", "cljs", "cljc", "edn"], accent: "#db5855", runnable: false, monacoId: "clojure" },
  { id: "swift", label: "Swift", extensions: ["swift"], accent: "#F05138", runnable: true, runCmd: "swift {file}", monacoId: "swift" },
  { id: "csharp", label: "C#", extensions: ["cs"], accent: "#178600", runnable: false, monacoId: "csharp" },
  { id: "kotlin", label: "Kotlin", extensions: ["kt", "kts"], accent: "#A97BFF", runnable: true, runCmd: "kotlinc {file} -include-runtime -d /tmp/a.jar && java -jar /tmp/a.jar", monacoId: "kotlin" },
  { id: "scala", label: "Scala", extensions: ["scala", "sc"], accent: "#c22d40", runnable: true, runCmd: "scala {file}", monacoId: "scala" },
  { id: "objectivec", label: "Objective-C", extensions: ["m", "mm"], accent: "#438eff", runnable: false, monacoId: "objective-c" },
  { id: "dart", label: "Dart", extensions: ["dart"], accent: "#00B4AB", runnable: true, runCmd: "dart run {file}", monacoId: "dart" },
  { id: "julia", label: "Julia", extensions: ["jl"], accent: "#a270ba", runnable: true, runCmd: "julia {file}", monacoId: "julia" },
  { id: "erlang", label: "Erlang", extensions: ["erl", "hrl"], accent: "#B83998", runnable: false, monacoId: "erlang" },
  { id: "groovy", label: "Groovy", extensions: ["groovy", "gradle"], accent: "#4298b8", runnable: true, runCmd: "groovy {file}", monacoId: "groovy" },
  { id: "powershell", label: "PowerShell", extensions: ["ps1", "psm1"], accent: "#012456", runnable: true, runCmd: "pwsh {file}", monacoId: "powershell" },
  { id: "toml", label: "TOML", extensions: ["toml"], accent: "#9c4221", runnable: false, monacoId: "toml" },
  { id: "dockerfile", label: "Dockerfile", extensions: ["dockerfile", "containerfile"], accent: "#384d54", runnable: false, monacoId: "dockerfile" },
];

/** Fallback for unknown / extensionless files: no highlighting, still editable. */
export const PLAINTEXT_LANGUAGE: IdeLanguage = {
  id: "plaintext",
  label: "Plain Text",
  extensions: ["txt", "text", "log"],
  accent: "#8a8a8a",
  runnable: false,
  monacoId: "plaintext",
};

const BY_ID = new Map<string, IdeLanguage>(IDE_LANGUAGES.map((l) => [l.id, l]));
const BY_EXT = new Map<string, IdeLanguage>();
for (const lang of IDE_LANGUAGES) for (const ext of lang.extensions) if (!BY_EXT.has(ext)) BY_EXT.set(ext, lang);

export function languageById(id: string | undefined | null): IdeLanguage {
  return (id && BY_ID.get(id)) || PLAINTEXT_LANGUAGE;
}

/** The extension of a file name, lowercased, no dot (`main.py` → `py`). Files
 *  with no dot use the whole name lowercased (`Dockerfile` → `dockerfile`). */
export function fileExtension(fileName: string): string {
  const base = fileName.trim().split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(dot + 1) : base).toLowerCase();
}

/** Resolve a file name to its language (by extension, else plaintext). */
export function languageForFileName(fileName: string): IdeLanguage {
  return BY_EXT.get(fileExtension(fileName)) || PLAINTEXT_LANGUAGE;
}
