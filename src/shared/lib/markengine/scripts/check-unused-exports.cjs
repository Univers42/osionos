const { execFileSync } = require("node:child_process");

const allowedPublicFacadeFiles = new Set([
  "index.ts",
  "inlineTextStyles.ts",
  "markdown.ts",
  "markdown/index.ts",
  "markdown/parserBlockHelpers.ts",
  "markdown/parserBlockNested.ts",
  "markdown/renderers/terminalHelpers.ts",
  "uiCollectionAssets.ts",
  "vite.config.ts",
]);

const output = execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["ts-prune", "-p", "tsconfig.prune.json"],
  { encoding: "utf8" },
)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !line.includes("(used in module)"))
  .filter((line) => {
    const [file] = line.split(":", 1);
    return !allowedPublicFacadeFiles.has(file);
  });

if (output.length > 0) {
  console.error(output.join("\n"));
  process.exit(1);
}

console.log("ts-prune: zero unused internal exports");