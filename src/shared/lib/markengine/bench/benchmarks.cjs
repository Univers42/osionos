/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   benchmarks.cjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { join, resolve } = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");
const { Bench } = require("tinybench");

const MARKENGINE_ROOT = resolve(__dirname, "..");
const NODE_GLOBAL = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1,
};

function loadModule(relativeEntryPoint, root = MARKENGINE_ROOT) {
  const bundle = esbuild.buildSync({
    entryPoints: [join(root, relativeEntryPoint)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    tsconfig: join(root, "tsconfig.json"),
  });

  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module,
    exports: module.exports,
    require,
    Node: NODE_GLOBAL,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    URL,
    URLSearchParams,
  });
  return module.exports;
}

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

function createMixedInlineParagraph(targetLength) {
  const segment =
    "plain **bold** _italic_ [color=#2563EB]blue[/color] [bg=#FACC15]marked[/bg] `code` [link](https://example.com) ";
  let text = "";
  while (text.length < targetLength) {
    text += segment;
  }
  return text.slice(0, targetLength);
}

function createFormattingSource(nodeCount) {
  const parts = [];
  for (let index = 0; index < nodeCount; index++) {
    const word = `word${index}`;
    if (index % 5 === 0) {
      parts.push(`[b]${word}[/b]`);
    } else if (index % 5 === 1) {
      parts.push(`[i]${word}[/i]`);
    } else if (index % 5 === 2) {
      parts.push(`[color=#2563EB]${word}[/color]`);
    } else if (index % 5 === 3) {
      parts.push(`[bg=#FACC15]${word}[/bg]`);
    } else {
      parts.push(word);
    }
  }
  return parts.join(" ");
}

function createStyle(properties = {}) {
  return {
    fontWeight: "",
    fontStyle: "",
    textDecoration: "",
    color: "",
    backgroundColor: "",
    ...properties,
    getPropertyValue(name) {
      return this[name] ?? "";
    },
  };
}

function createTextNode(value) {
  return {
    nodeType: NODE_GLOBAL.TEXT_NODE,
    textContent: value,
  };
}

function createElement(tagName, options = {}) {
  const attributes = options.attributes ?? {};
  const classes = new Set(options.classNames ?? []);
  return {
    nodeType: NODE_GLOBAL.ELEMENT_NODE,
    tagName,
    childNodes: options.childNodes ?? [],
    dataset: options.dataset ?? {},
    style: createStyle(options.style),
    classList: {
      contains(className) {
        return classes.has(className);
      },
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

function createDeepInlineDomLayer(index, child) {
  if (index % 3 === 0) {
    return createElement("SPAN", {
      dataset: { inlineType: "text_color", inlineColor: "#2563EB" },
      attributes: {
        "data-inline-type": "text_color",
        "data-inline-color": "#2563EB",
      },
      style: {
        color: "#2563EB",
        textDecorationColor: "#2563EB",
        "--inline-code-color": "#2563EB",
        "--inline-code-decoration-color": "#2563EB",
      },
      childNodes: [child],
    });
  }

  if (index % 3 === 1) {
    return createElement("SPAN", {
      dataset: { inlineType: "background_color", inlineColor: "#FACC15" },
      attributes: {
        "data-inline-type": "background_color",
        "data-inline-color": "#FACC15",
      },
      style: { backgroundColor: "#FACC15" },
      childNodes: [child],
    });
  }

  return createElement("SPAN", {
    style: { fontWeight: "700" },
    childNodes: [child],
  });
}

function createDeepInlineDomTree(depth) {
  let child = createTextNode("deep editable content");

  for (let index = 0; index < depth; index++) {
    child = createDeepInlineDomLayer(index, child);
  }

  return createElement("DIV", { childNodes: [child] });
}

function percentile(sortedSamples, fraction) {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(sortedSamples.length * fraction) - 1),
  );
  return sortedSamples[index];
}

function roundMetric(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(6));
}

function medianOpsPerSecond(latencyP50Ms) {
  return latencyP50Ms > 0 ? 1000 / latencyP50Ms : 0;
}

function createBenchmarkScenarios(root = MARKENGINE_ROOT) {
  const canonical = loadModule("markdown.ts", root);
  const richParser = loadModule("markdown/parser.ts", root);
  const inlineFormatting = loadModule("inlineFormatting.ts", root);
  const inlineTextEditing = loadModule("inlineTextEditing.ts", root);
  const inlineDocument = loadModule("inlineDocument.ts", root);
  const inlineEditorDom = loadModule("inlineEditorDom.ts", root);

  const markdown1Kb = createMarkdownDocument(1024);
  const markdown100Kb = createMarkdownDocument(100 * 1024);
  const markdown1Mb = createMarkdownDocument(1024 * 1024);
  const inlineParagraph = createMixedInlineParagraph(10_000);
  const incrementalBase = createMarkdownDocument(16 * 1024);
  const incrementalBaseResult = canonical.parseMarkdown(incrementalBase, {
    documentVersion: 1,
  });
  const incrementalLineIndex = incrementalBase.split("\n").length - 1;
  const formattingSource = createFormattingSource(50);
  const formattingSelection = { start: 0, end: 50 * 5 };
  const typingSource = `[b]${"x".repeat(1000)}[/b]`;
  const deepDomTree = createDeepInlineDomTree(80);

  return [
    {
      name: "parse markdown 1KB",
      run() {
        canonical.parseMarkdown(markdown1Kb, { documentVersion: 1 });
      },
    },
    {
      name: "parse markdown 100KB",
      run() {
        canonical.parseMarkdown(markdown100Kb, { documentVersion: 1 });
      },
    },
    {
      name: "parse markdown 1MB",
      run() {
        canonical.parseMarkdown(markdown1Mb, { documentVersion: 1 });
      },
    },
    {
      name: "parse inline mixed 10K chars",
      run() {
        richParser.parseInline(inlineParagraph);
      },
    },
    {
      name: "incremental typing 1000 patches",
      run() {
        let text = incrementalBase;
        let result = incrementalBaseResult;
        for (let index = 0; index < 1000; index++) {
          const nextText = `${text}${index % 10}`;
          const next = canonical.incrementalParse(text, result, {
            fromLine: incrementalLineIndex,
            toLine: incrementalLineIndex,
            text: nextText.split("\n").at(-1) ?? "",
          });
          result = {
            ast: next.ast,
            blockIndex: next.blockIndex,
            diagnostics: next.diagnostics,
          };
          text = next.text;
        }
      },
    },
    {
      name: "applyInlineFormatting 50-node selection",
      run() {
        inlineFormatting.applyInlineFormatting(
          formattingSource,
          formattingSelection,
          { type: "toggle_format", format: "bold" },
        );
      },
    },
    {
      name: "inline typing string wrappers 1000 chars",
      run() {
        let source = typingSource;
        let selection = { start: 1000, end: 1000 };
        for (let index = 0; index < 1000; index++) {
          const next = inlineTextEditing.applyInlineTextEdit(source, selection, {
            type: "insert_text",
            text: String(index % 10),
          });
          source = next.source;
          selection = next.selection;
        }
      },
    },
    {
      name: "inline typing InlineDocument 1000 chars",
      run() {
        let doc = inlineDocument.InlineDocument.fromSource(typingSource);
        let selection = { start: 1000, end: 1000 };
        for (let index = 0; index < 1000; index++) {
          const next = doc.applyEdit(selection, {
            type: "insert_text",
            text: String(index % 10),
          });
          doc = next.doc;
          selection = next.selection;
        }
      },
    },
    {
      name: "readInlineEditorDomState deep tree",
      run() {
        inlineEditorDom.readInlineEditorDomState(deepDomTree);
      },
    },
  ];
}

function runBenchmarks(options = {}) {
  const scenarios = createBenchmarkScenarios(options.root ?? MARKENGINE_ROOT);
  const bench = new Bench({
    time: options.time ?? Number(process.env.MARKENGINE_BENCH_TIME_MS ?? 300),
    iterations: options.iterations ?? 1,
    warmupTime:
      options.warmupTime ??
      Number(process.env.MARKENGINE_BENCH_WARMUP_MS ?? 100),
    warmupIterations: options.warmupIterations ?? 1,
    retainSamples: true,
  });

  for (const scenario of scenarios) {
    bench.add(scenario.name, () => {
      try {
        scenario.run();
      } catch (error) {
        throw new Error(`${scenario.name}: ${error.message}`, {
          cause: error,
        });
      }
    });
  }

  bench.runSync();

  const benchmarks = bench.tasks.map((task) => {
    const result = task.result;
    if (!result || result.state === "errored") {
      throw result?.error ?? new Error(`Benchmark failed: ${task.name}`);
    }

    const samples = result.latency.samples ?? [];
    return {
      name: task.name,
      opsPerSecond: roundMetric(medianOpsPerSecond(result.latency.p50)),
      latencyMs: {
        mean: roundMetric(result.latency.mean),
        p50: roundMetric(result.latency.p50),
        p95: roundMetric(percentile(samples, 0.95)),
        p99: roundMetric(result.latency.p99),
      },
      samples: result.latency.samplesCount,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    benchmarks,
  };
}

// Hardware-relative comparison. Each `round` is {head, reference}: two live
// runBenchmarks() results measured in the SAME process/run (see abGuard.cjs),
// one against HEAD's source and one against a pinned reference commit's
// source. Comparing two same-run measurements cancels out machine speed —
// unlike the old design, which compared a live run against numbers frozen on
// a single developer workstation (see bench/reference.json for why).
//
// Across rounds we keep the BEST (highest) ratio per benchmark. Rounds swap
// A/B order, so a transient stall that lands on one side of one round is
// discarded rather than failing the build. A REAL regression is slow in every
// round, so its best ratio is still below tolerance — noise is suppressed
// without widening the threshold.
function compareResults(rounds, tolerancePercent) {
  const allowedRegression = tolerancePercent / 100;
  const bestByName = new Map();
  const failures = [];

  for (const round of rounds) {
    const referenceByName = new Map(
      round.reference.benchmarks.map((benchmark) => [benchmark.name, benchmark]),
    );

    for (const benchmark of round.head.benchmarks) {
      const previous = referenceByName.get(benchmark.name);
      if (!previous) {
        failures.push(`${benchmark.name}: missing from reference commit`);
        continue;
      }

      const ratio = benchmark.opsPerSecond / previous.opsPerSecond;
      const best = bestByName.get(benchmark.name);
      if (!best || ratio > best.ratio) {
        bestByName.set(benchmark.name, {
          name: benchmark.name,
          headOpsPerSecond: benchmark.opsPerSecond,
          referenceOpsPerSecond: previous.opsPerSecond,
          ratio,
        });
      }
    }
  }

  const comparisons = [...bestByName.values()];
  for (const comparison of comparisons) {
    if (comparison.ratio < 1 - allowedRegression) {
      const deltaPercent = ((1 - comparison.ratio) * 100).toFixed(1);
      failures.push(
        `${comparison.name}: ${deltaPercent}% slower than the reference commit ` +
          `(${comparison.headOpsPerSecond.toFixed(2)} vs ${comparison.referenceOpsPerSecond.toFixed(2)} ops/sec; ` +
          `tolerance is ${tolerancePercent}%, best of ${rounds.length} rounds)`,
      );
    }
  }

  return { comparisons, failures };
}

module.exports = {
  compareResults,
  runBenchmarks,
};
