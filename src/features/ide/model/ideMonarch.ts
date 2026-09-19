/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideMonarch.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { languages } from "monaco-editor/editor";

// Monarch grammars for the five IDE languages Monaco ships no definition for
// (JSON is deliberately NOT taken from Monaco's JSON language service: that
// registers a worker + IntelliSense, and this editor's completion comes from the
// sandbox LSP only). Small on purpose — keywords, comments, strings, numbers —
// they color the long tail, they do not parse it. Loaded lazily as one chunk by
// monacoLanguages.ts the first time one of them opens.

export interface MonarchDefinition {
  extensions: string[];
  conf: languages.LanguageConfiguration;
  language: languages.IMonarchLanguage;
}

const BRACKETS: languages.LanguageConfiguration["brackets"] = [["{", "}"], ["[", "]"], ["(", ")"]];
const PAIRS = [
  { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: '"', close: '"', notIn: ["string"] },
];
const C_COMMENT: languages.IMonarchLanguageRule[] = [[/[^/*]+/, "comment"], [/\*\//, "comment", "@pop"], [/[/*]/, "comment"]];

const json: MonarchDefinition = {
  extensions: [".json", ".jsonc", ".json5"],
  conf: { comments: { lineComment: "//", blockComment: ["/*", "*/"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
  language: {
    tokenizer: {
      root: [
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "key"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/\b(?:true|false|null)\b/, "keyword"],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/[{}[\]]/, "@brackets"],
        [/[,:]/, "delimiter"],
      ],
      comment: C_COMMENT,
    },
  },
};

const toml: MonarchDefinition = {
  extensions: [".toml"],
  conf: { comments: { lineComment: "#" }, brackets: BRACKETS, autoClosingPairs: PAIRS },
  language: {
    tokenizer: {
      root: [
        [/^\s*\[\[?[^\]]+\]\]?/, "type"],
        [/#.*$/, "comment"],
        [/^\s*[A-Za-z0-9_.-]+(?=\s*=)/, "key"],
        [/"""/, "string", "@mlDouble"],
        [/'''/, "string", "@mlSingle"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'[^']*'/, "string"],
        [/\b(?:true|false)\b/, "keyword"],
        [/\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?/, "number"],
        [/[+-]?(?:inf|nan)\b/, "number"],
        [/[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/, "number"],
        [/[{}[\]]/, "@brackets"],
        [/[,=.]/, "delimiter"],
      ],
      mlDouble: [[/[^"]+/, "string"], [/"""/, "string", "@pop"], [/"/, "string"]],
      mlSingle: [[/[^']+/, "string"], [/'''/, "string", "@pop"], [/'/, "string"]],
    },
  },
};

const haskell: MonarchDefinition = {
  extensions: [".hs"],
  conf: { comments: { lineComment: "--", blockComment: ["{-", "-}"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
  language: {
    keywords: ["case", "class", "data", "default", "deriving", "do", "else", "foreign", "if", "import", "in", "infix", "infixl", "infixr", "instance", "let", "module", "newtype", "of", "then", "type", "where", "forall", "mdo", "family", "qualified", "hiding", "as"],
    tokenizer: {
      root: [
        [/--.*$/, "comment"],
        [/\{-/, "comment", "@comment"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)'/, "string"],
        [/\b[A-Z][\w']*/, "type"],
        [/\b[a-z_][\w']*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/[-+*/<>=:|&!$%^~.\\@?]+/, "operator"],
        [/[()[\]{}]/, "@brackets"],
        [/[,;`]/, "delimiter"],
      ],
      comment: [[/[^{-]+/, "comment"], [/\{-/, "comment", "@push"], [/-\}/, "comment", "@pop"], [/[{-]/, "comment"]],
    },
  },
};

const erlang: MonarchDefinition = {
  extensions: [".erl", ".hrl"],
  conf: { comments: { lineComment: "%" }, brackets: BRACKETS, autoClosingPairs: PAIRS },
  language: {
    keywords: ["after", "and", "andalso", "band", "begin", "bnot", "bor", "bsl", "bsr", "bxor", "case", "catch", "cond", "div", "end", "fun", "if", "let", "not", "of", "or", "orelse", "receive", "rem", "try", "when", "xor"],
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/^-[a-z]+/, "keyword"],
        [/\b[A-Z_][\w@]*/, "variable"],
        [/\b[a-z][\w@]*(?=\()/, "entity.name.function"],
        [/\b[a-z][\w@]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/'[^']*'/, "string"],
        [/\$./, "string"],
        [/\d+#[0-9a-zA-Z]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/[-+*/<>=:|&!?]+/, "operator"],
        [/[()[\]{}]/, "@brackets"],
        [/[,;.]/, "delimiter"],
      ],
    },
  },
};

const groovy: MonarchDefinition = {
  extensions: [".groovy", ".gradle"],
  conf: { comments: { lineComment: "//", blockComment: ["/*", "*/"] }, brackets: BRACKETS, autoClosingPairs: [...PAIRS, { open: "'", close: "'", notIn: ["string"] }] },
  language: {
    keywords: ["abstract", "as", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "def", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import", "in", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "trait", "transient", "try", "var", "void", "volatile", "while"],
    literals: ["true", "false", "null"],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"""/, "string", "@tripleDouble"],
        [/'''/, "string", "@tripleSingle"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
        [/@[A-Za-z_]\w*/, "annotation"],
        [/\b[A-Z][\w$]*/, "type"],
        [/[a-z_$][\w$]*/, { cases: { "@keywords": "keyword", "@literals": "constant", "@default": "identifier" } }],
        [/0[xX][0-9a-fA-F_]+[lL]?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFdDlLgG]?/, "number"],
        [/[-+*/%<>=!&|^~?:.]+/, "operator"],
        [/[()[\]{}]/, "@brackets"],
        [/[,;]/, "delimiter"],
      ],
      comment: C_COMMENT,
      tripleDouble: [[/[^"]+/, "string"], [/"""/, "string", "@pop"], [/"/, "string"]],
      tripleSingle: [[/[^']+/, "string"], [/'''/, "string", "@pop"], [/'/, "string"]],
    },
  },
};

export const MONARCH_DEFINITIONS: Record<string, MonarchDefinition> = { json, toml, haskell, erlang, groovy };
