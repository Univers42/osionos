const { incrementalParse, parseMarkdown } = require("../dist/markdown.js");

function createLineIsolatedDocument(lineCount) {
  const lines = [];
  for (let index = 0; index < lineCount; index++) {
    lines.push(index % 2 === 0 ? `Paragraph ${index} with **inline** text.` : "");
  }
  return lines.join("\n");
}

function time(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

const rows = [];

for (const lineCount of [1000, 5000, 10000, 50000, 200000]) {
  const editLine = Math.floor(lineCount / 2) & ~1;
  const iterations = 200;
  let text = createLineIsolatedDocument(lineCount);
  let result = parseMarkdown(text, { documentVersion: 1 });

  const warm = incrementalParse(text, result, {
    fromLine: editLine,
    toLine: editLine,
    text: `Paragraph ${editLine} with **inline** text.warm`,
  });
  text = warm.text;
  result = {
    ast: warm.ast,
    blockIndex: warm.blockIndex,
    diagnostics: warm.diagnostics,
  };

  const elapsedMs = time(() => {
    for (let index = 0; index < iterations; index++) {
      const next = incrementalParse(text, result, {
        fromLine: editLine,
        toLine: editLine,
        text: `Paragraph ${editLine} with **inline** text.${index % 10}`,
      });
      text = next.text;
      result = {
        ast: next.ast,
        blockIndex: next.blockIndex,
        diagnostics: next.diagnostics,
      };
    }
  });

  const msPerEdit = elapsedMs / iterations;
  rows.push({
    lines: lineCount,
    iterations,
    msPerEdit: Number(msPerEdit.toFixed(4)),
    msPerEditPer1kLines: Number((msPerEdit / (lineCount / 1000)).toFixed(5)),
  });
}

console.table(rows);
