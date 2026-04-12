import React, { useMemo } from "react";
import hljs from "highlight.js/lib/core";

import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import ini from "highlight.js/lib/languages/ini";

interface CodeSyntaxHighlightProps {
  code: string;
  language?: string;
  className?: string;
  codeClassName?: string;
}

let registered = false;

function ensureRegisteredLanguages() {
  if (registered) return;

  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("ruby", ruby);
  hljs.registerLanguage("php", php);
  hljs.registerLanguage("swift", swift);
  hljs.registerLanguage("kotlin", kotlin);
  hljs.registerLanguage("lua", lua);
  hljs.registerLanguage("toml", ini);

  registered = true;
}

function normalizeLanguage(language?: string) {
  const raw = (language ?? "plaintext").trim().toLowerCase();

  if (raw === "plaintext" || raw === "text") return null;
  if (raw === "ts") return "typescript";
  if (raw === "js") return "javascript";
  if (raw === "sh" || raw === "shell") return "bash";
  if (raw === "yml") return "yaml";
  if (raw === "md") return "markdown";
  if (raw === "htm") return "html";

  return raw;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const CodeSyntaxHighlight: React.FC<CodeSyntaxHighlightProps> = ({
  code,
  language,
  className,
  codeClassName,
}) => {
  const highlighted = useMemo(() => {
    ensureRegisteredLanguages();
    const normalized = normalizeLanguage(language);

    if (!normalized) return escapeHtml(code);

    if (!hljs.getLanguage(normalized)) {
      return escapeHtml(code);
    }

    try {
      return hljs.highlight(code, {
        language: normalized,
        ignoreIllegals: true,
      }).value;
    } catch {
      return escapeHtml(code);
    }
  }, [code, language]);

  const normalized = normalizeLanguage(language);

  return (
    <pre className={className}>
      <code
        className={[
          "hljs",
          normalized ? `language-${normalized}` : "",
          codeClassName ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
};
