const {
  createNodeMarkEngineWorkerClient,
  parseMarkdown,
} = require("../dist/markdown.js");

function createMarkdownDocument(targetBytes) {
  const block = [
    "# Benchmark Heading",
    "",
    "A paragraph with **strong text**, _emphasis_, `code`, and [a link](https://example.com).",
    "",
    "- First item",
    "- Second item with nested words",
    "- Third item",
    "",
    "> A quoted paragraph that still contains **inline** markup.",
    "",
    "```ts",
    "const value = 42;",
    "console.log(value);",
    "```",
    "",
  ].join("\n");

  let markdown = "";
  while (Buffer.byteLength(markdown, "utf8") < targetBytes) {
    markdown += block;
  }
  return markdown.slice(0, targetBytes);
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function waitForTimerDelay(startMs) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(nowMs() - startMs), 0);
  });
}

async function measureSyncParse(source) {
  const startedAt = nowMs();
  const timerDelay = waitForTimerDelay(startedAt);
  parseMarkdown(source, { documentVersion: 1 });
  const totalMs = nowMs() - startedAt;
  const mainThreadBlockingMs = await timerDelay;
  return { mainThreadBlockingMs, totalMs };
}

async function measureWorkerParse(source) {
  const worker = createNodeMarkEngineWorkerClient({ syncThresholdBytes: 0 });
  try {
    await worker.parse("# warmup", { documentVersion: 0 });
    const startedAt = nowMs();
    const timerDelay = waitForTimerDelay(startedAt);
    const parseTask = worker.parse(source, { documentVersion: 1 });
    const mainThreadBlockingMs = await timerDelay;
    await parseTask;
    const totalMs = nowMs() - startedAt;
    return { mainThreadBlockingMs, totalMs };
  } finally {
    worker.dispose();
  }
}

function round(value) {
  return Number(value.toFixed(3));
}

async function main() {
  const source = createMarkdownDocument(1024 * 1024);
  const sync = await measureSyncParse(source);
  const worker = await measureWorkerParse(source);

  console.table([
    {
      scenario: "parse 1MB on main thread",
      "main-thread blocking ms": round(sync.mainThreadBlockingMs),
      "total work ms": round(sync.totalMs),
    },
    {
      scenario: "parse 1MB in MarkEngineWorker",
      "main-thread blocking ms": round(worker.mainThreadBlockingMs),
      "total work ms": round(worker.totalMs),
    },
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});