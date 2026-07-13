/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideLanguages.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/**
 * The IDE language registry — one record per language. It drives four things:
 * syntax highlighting (`cmLoad`), the tab icon accent, whether the runner can
 * execute it (`runnable` + `runCmd`, read by P3), and which formatter to use
 * (`formatterId`, read by P4). Adding a language = one record here (+ its
 * toolchain in the runner image if runnable). `cmLoad` dynamically imports the
 * `@codemirror/lang-*` (or legacy StreamLanguage) so each language is its own
 * chunk — nothing loads until a file of that type opens.
 *
 * `runCmd` uses `{file}` as the source-path placeholder; it is DATA consumed by
 * the sandboxed runner (P3), never executed client-side.
 *
 * ponytail: covers the 15 lang-* majors + the common legacy modes (~35 langs).
 * legacy-modes ships 100+ more — extend by adding one record with a
 * `legacy(() => import(".../mode/<x>").then(m => m.<x>))` cmLoad.
 */
export interface IdeLanguage {
  /** Canonical id (also the CodeMirror-ish language key). */
  id: string;
  label: string;
  /** File extensions (lowercase, no dot) that map to this language. */
  extensions: string[];
  /** Lazily load the CodeMirror language extension for highlighting. */
  cmLoad: () => Promise<Extension>;
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

/** Wrap a legacy StreamLanguage mode as a CodeMirror language extension. */
function legacy(loadMode: () => Promise<unknown>): () => Promise<Extension> {
  return () => loadMode().then((mode) => new LanguageSupport(StreamLanguage.define(mode as Parameters<typeof StreamLanguage.define>[0])));
}

export const IDE_LANGUAGES: IdeLanguage[] = [
  { id: "python", label: "Python", extensions: ["py", "pyw", "pyi"], accent: "#3572A5", runnable: true, runCmd: "python3 {file}", formatterId: "black",
    cmLoad: () => import("@codemirror/lang-python").then((m) => m.python()) },
  { id: "c", label: "C", extensions: ["c", "h"], accent: "#555555", runnable: true, runCmd: "gcc -O2 -std=c17 -o /tmp/a.out {file} && /tmp/a.out", formatterId: "clang-format",
    cmLoad: () => import("@codemirror/lang-cpp").then((m) => m.cpp()) },
  { id: "cpp", label: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "hxx", "h++", "ipp"], accent: "#f34b7d", runnable: true, runCmd: "g++ -O2 -std=c++20 -o /tmp/a.out {file} && /tmp/a.out", formatterId: "clang-format",
    cmLoad: () => import("@codemirror/lang-cpp").then((m) => m.cpp()) },
  { id: "java", label: "Java", extensions: ["java"], accent: "#b07219", runnable: true, runCmd: "cd /tmp && cp {file} Main.java && javac Main.java && java Main", formatterId: "google-java-format",
    cmLoad: () => import("@codemirror/lang-java").then((m) => m.java()) },
  { id: "javascript", label: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"], accent: "#f1e05a", runnable: true, runCmd: "node {file}", formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })) },
  { id: "typescript", label: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"], accent: "#3178c6", runnable: true, runCmd: "node --experimental-strip-types {file}", formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })) },
  { id: "rust", label: "Rust", extensions: ["rs"], accent: "#dea584", runnable: true, runCmd: "rustc -O -o /tmp/a.out {file} && /tmp/a.out", formatterId: "rustfmt",
    cmLoad: () => import("@codemirror/lang-rust").then((m) => m.rust()) },
  { id: "go", label: "Go", extensions: ["go"], accent: "#00ADD8", runnable: true, runCmd: "go run {file}", formatterId: "gofmt",
    cmLoad: () => import("@codemirror/lang-go").then((m) => m.go()) },
  { id: "php", label: "PHP", extensions: ["php"], accent: "#4F5D95", runnable: true, runCmd: "php {file}", formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-php").then((m) => m.php()) },
  { id: "sql", label: "SQL", extensions: ["sql"], accent: "#e38c00", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-sql").then((m) => m.sql()) },
  { id: "html", label: "HTML", extensions: ["html", "htm", "xhtml"], accent: "#e34c26", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-html").then((m) => m.html()) },
  { id: "css", label: "CSS", extensions: ["css", "scss", "sass", "less"], accent: "#563d7c", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-css").then((m) => m.css()) },
  { id: "json", label: "JSON", extensions: ["json", "jsonc", "json5"], accent: "#cbcb41", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-json").then((m) => m.json()) },
  { id: "markdown", label: "Markdown", extensions: ["md", "markdown", "mdx"], accent: "#083fa1", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-markdown").then((m) => m.markdown()) },
  { id: "xml", label: "XML", extensions: ["xml", "svg", "xsl", "plist"], accent: "#0060ac", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-xml").then((m) => m.xml()) },
  { id: "yaml", label: "YAML", extensions: ["yml", "yaml"], accent: "#cb171e", runnable: false, formatterId: "prettier",
    cmLoad: () => import("@codemirror/lang-yaml").then((m) => m.yaml()) },
  // --- legacy StreamLanguage modes (bash + the common long tail) ---
  { id: "shell", label: "Shell", extensions: ["sh", "bash", "zsh", "ksh", "command"], accent: "#89e051", runnable: true, runCmd: "bash {file}", formatterId: "shfmt",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell)) },
  { id: "ruby", label: "Ruby", extensions: ["rb", "rake", "gemspec"], accent: "#701516", runnable: true, runCmd: "ruby {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby)) },
  { id: "lua", label: "Lua", extensions: ["lua"], accent: "#000080", runnable: true, runCmd: "lua {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua)) },
  { id: "perl", label: "Perl", extensions: ["pl", "pm"], accent: "#0298c3", runnable: true, runCmd: "perl {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/perl").then((m) => m.perl)) },
  { id: "r", label: "R", extensions: ["r"], accent: "#198CE7", runnable: true, runCmd: "Rscript {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/r").then((m) => m.r)) },
  { id: "haskell", label: "Haskell", extensions: ["hs"], accent: "#5e5086", runnable: true, runCmd: "runghc {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/haskell").then((m) => m.haskell)) },
  { id: "clojure", label: "Clojure", extensions: ["clj", "cljs", "cljc", "edn"], accent: "#db5855", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clojure").then((m) => m.clojure)) },
  { id: "swift", label: "Swift", extensions: ["swift"], accent: "#F05138", runnable: true, runCmd: "swift {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift)) },
  { id: "csharp", label: "C#", extensions: ["cs"], accent: "#178600", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.csharp)) },
  { id: "kotlin", label: "Kotlin", extensions: ["kt", "kts"], accent: "#A97BFF", runnable: true, runCmd: "kotlinc {file} -include-runtime -d /tmp/a.jar && java -jar /tmp/a.jar",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin)) },
  { id: "scala", label: "Scala", extensions: ["scala", "sc"], accent: "#c22d40", runnable: true, runCmd: "scala {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.scala)) },
  { id: "objectivec", label: "Objective-C", extensions: ["m", "mm"], accent: "#438eff", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.objectiveC)) },
  { id: "dart", label: "Dart", extensions: ["dart"], accent: "#00B4AB", runnable: true, runCmd: "dart run {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/clike").then((m) => m.dart)) },
  { id: "julia", label: "Julia", extensions: ["jl"], accent: "#a270ba", runnable: true, runCmd: "julia {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/julia").then((m) => m.julia)) },
  { id: "erlang", label: "Erlang", extensions: ["erl", "hrl"], accent: "#B83998", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/erlang").then((m) => m.erlang)) },
  { id: "groovy", label: "Groovy", extensions: ["groovy", "gradle"], accent: "#4298b8", runnable: true, runCmd: "groovy {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/groovy").then((m) => m.groovy)) },
  { id: "powershell", label: "PowerShell", extensions: ["ps1", "psm1"], accent: "#012456", runnable: true, runCmd: "pwsh {file}",
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/powershell").then((m) => m.powerShell)) },
  { id: "toml", label: "TOML", extensions: ["toml"], accent: "#9c4221", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml)) },
  { id: "dockerfile", label: "Dockerfile", extensions: ["dockerfile", "containerfile"], accent: "#384d54", runnable: false,
    cmLoad: legacy(() => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile)) },
];

/** Fallback for unknown / extensionless files: no highlighting, still editable. */
export const PLAINTEXT_LANGUAGE: IdeLanguage = {
  id: "plaintext",
  label: "Plain Text",
  extensions: ["txt", "text", "log"],
  accent: "#8a8a8a",
  runnable: false,
  cmLoad: () => Promise.resolve([] as Extension),
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
