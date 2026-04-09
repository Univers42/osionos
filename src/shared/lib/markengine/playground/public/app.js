const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const ast = document.querySelector("#ast");
const sampleButton = document.querySelector("#sample-button");
const clearButton = document.querySelector("#clear-button");

const sample = `# MarkEngine Playground

This is a **live** playground for the markdown engine.

## Blocks

- Paragraphs
- Headings
- Lists
- Blockquotes
- Code blocks

> Edit the text on the left and the server will re-run the TypeScript engine.


\`\`\`ts
const answer = 42;
console.log(answer);
\`\`\`
`;

editor.value = sample;

async function render() {
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ markdown: editor.value }),
  });

  const data = await response.json();
  if (!response.ok) {
    preview.innerHTML = `<pre class="error">${escapeHtml(data.error || "Preview failed")}</pre>`;
    ast.textContent = "";
    return;
  }

  preview.innerHTML = data.html;
  ast.textContent = JSON.stringify(data.ast, null, 2);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let timer = 0;
function scheduleRender() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    render().catch((error) => {
      preview.innerHTML = `<pre class="error">${escapeHtml(error.message)}</pre>`;
    });
  }, 80);
}

function selectedLineRange(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = text.indexOf("\n", end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  return { lineStart, lineEnd };
}

function getCurrentLineInfo() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;
  const { lineStart, lineEnd } = selectedLineRange(text, start, end);
  const line = text.slice(lineStart, lineEnd);
  return { start, end, text, lineStart, lineEnd, line };
}

function parseListLine(line) {
  const taskMatch = /^(\s*)([-*+]\s+)\[([ xX])\]\s+(.*)$/.exec(line);
  if (taskMatch) {
    const indent = taskMatch[1];
    const bullet = taskMatch[2];
    const content = taskMatch[4];
    return {
      indent,
      marker: `${bullet}[ ] `,
      content,
      isBlank: content.trim().length === 0,
      nextMarker: `${indent}${bullet}[ ] `,
      kind: "task",
    };
  }

  const match = /^(\s*)([-*+]\s+|\d+[.)]\s+)(.*)$/.exec(line);
  if (!match) return null;

  const indent = match[1];
  const marker = match[2];
  const content = match[3];
  const ordered = /\d+[.)]\s+/.test(marker);

  if (!ordered) {
    return {
      indent,
      marker,
      content,
      isBlank: content.trim().length === 0,
      nextMarker: `${indent}${marker}`,
      kind: "unordered",
    };
  }

  const orderedMatch = /^(\d+)([.)])\s+$/.exec(marker);
  const current = orderedMatch ? Number.parseInt(orderedMatch[1], 10) : 1;
  const sep = orderedMatch ? orderedMatch[2] : ".";
  return {
    indent,
    marker,
    content,
    isBlank: content.trim().length === 0,
    nextMarker: `${indent}${current + 1}${sep} `,
    kind: "ordered",
  };
}

function indentLineAtLevel(lineStart, lineEnd, shiftKey) {
  const line = editor.value.slice(lineStart, lineEnd);
  if (shiftKey) {
    if (line.startsWith("\t")) {
      editor.setRangeText("", lineStart, lineStart + 1, "preserve");
      return;
    }
    if (line.startsWith("  ")) {
      editor.setRangeText("", lineStart, lineStart + 2, "preserve");
      return;
    }
    return;
  }

  editor.setRangeText("  ", lineStart, lineStart, "preserve");
}

function handleTabIndent(event) {
  const { start, end, text, lineStart, lineEnd, line } = getCurrentLineInfo();
  const listInfo = parseListLine(line);

  if (start === end && listInfo) {
    indentLineAtLevel(lineStart, lineEnd, event.shiftKey);
    scheduleRender();
    return;
  }

  if (start === end && !event.shiftKey) {
    editor.setRangeText("\t", start, end, "end");
    scheduleRender();
    return;
  }

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");

  if (event.shiftKey) {
    const outdented = lines.map((line) => {
      if (line.startsWith("\t")) return line.slice(1);
      if (line.startsWith("    ")) return line.slice(4);
      if (line.startsWith("  ")) return line.slice(2);
      return line;
    });
    const replacement = outdented.join("\n");
    editor.setRangeText(replacement, lineStart, lineEnd, "preserve");
    scheduleRender();
    return;
  }

  const indented = lines.map((line) => `\t${line}`).join("\n");
  editor.setRangeText(indented, lineStart, lineEnd, "preserve");
  scheduleRender();
}

function handleEnterInList(event) {
  const { start, end, text, lineStart, lineEnd, line } = getCurrentLineInfo();
  if (start !== end) return;

  const listInfo = parseListLine(line);
  if (!listInfo) return;

  event.preventDefault();

  if (listInfo.isBlank) {
    if (lineEnd < text.length && text[lineEnd] === "\n") {
      editor.setRangeText("", lineStart, lineEnd + 1, "start");
    } else if (lineStart > 0 && text[lineStart - 1] === "\n") {
      editor.setRangeText("", lineStart - 1, lineEnd, "start");
    } else {
      editor.setRangeText("", lineStart, lineEnd, "start");
    }
    scheduleRender();
    return;
  }

  editor.setRangeText(`\n${listInfo.nextMarker}`, start, start, "end");
  scheduleRender();
}

editor.addEventListener("input", scheduleRender);
editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleEnterInList(event);
    return;
  }
  if (event.key !== "Tab") return;
  event.preventDefault();
  handleTabIndent(event);
});
sampleButton.addEventListener("click", () => {
  editor.value = sample;
  scheduleRender();
});
clearButton.addEventListener("click", () => {
  editor.value = "";
  scheduleRender();
  editor.focus();
});

render().catch((error) => {
  preview.innerHTML = `<pre class="error">${escapeHtml(error.message)}</pre>`;
});
