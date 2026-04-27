import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TEST_PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3004", 10);
const OFFICIAL_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
  );
}

function formatResult(status, message) {
  return `${status} ${message}`;
}

function checkNodeVersion(results) {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major >= 22) {
    results.push(formatResult("OK", `Node ${process.version}`));
    return true;
  }

  results.push(
    formatResult(
      "FAIL",
      `Node ${process.version} unsupported. Use \`nvm use\` (repo pins Node 22) or install Node 22+.`,
    ),
  );
  return false;
}

function checkPackageManager(pkg, results) {
  const official = pkg.packageManager ?? "npm";
  const userAgent = process.env.npm_config_user_agent ?? "";

  if (userAgent.startsWith("npm/")) {
    results.push(formatResult("OK", `Package manager ${official}`));
    return true;
  }

  if (userAgent.length === 0) {
    results.push(formatResult("WARN", `Run doctor through npm. Official manager ${official}.`));
    return true;
  }

  results.push(
    formatResult(
      "FAIL",
      `Detected ${userAgent}. Official manager ${official}. Run \`npm ci\`, not pnpm/yarn.`,
    ),
  );
  return false;
}

function checkDependenciesInstalled(results) {
  const playwrightPkg = path.join(ROOT, "node_modules", "playwright", "package.json");
  if (fs.existsSync(playwrightPkg)) {
    results.push(formatResult("OK", "Local dependencies installed"));
    return true;
  }

  results.push(formatResult("FAIL", "Dependencies missing. Run `npm ci` first."));
  return false;
}

function checkPlaywrightVersion(pkg, results) {
  const installed = readJson("node_modules/playwright/package.json").version ?? "";
  const expected =
    (pkg.devDependencies?.playwright ?? "").replace(/^[^\d]*/, "") ||
    (pkg.devDependencies?.["@playwright/test"] ?? "").replace(/^[^\d]*/, "");

  if (!expected || installed === expected) {
    results.push(formatResult("OK", `Playwright ${installed}`));
    return true;
  }

  results.push(
    formatResult(
      "FAIL",
      `Playwright ${installed} != package.json ${expected}. Reinstall with \`npm ci\`.`,
    ),
  );
  return false;
}

function resolvePlaywrightCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Caches", "ms-playwright");
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
        "ms-playwright",
      );
    default:
      return path.join(home, ".cache", "ms-playwright");
  }
}

function checkBrowsersInstalled(results) {
  const browserMetadata = readJson("node_modules/playwright-core/browsers.json").browsers ?? [];
  const chromium = browserMetadata.find((browser) => browser.name === "chromium");
  const shell = browserMetadata.find((browser) => browser.name === "chromium-headless-shell");
  const cacheDir = resolvePlaywrightCacheDir();

  if (!chromium?.revision || !shell?.revision) {
    results.push(formatResult("FAIL", "Could not resolve expected Playwright browser revisions."));
    return false;
  }

  const hasChromium = fs.existsSync(path.join(cacheDir, `chromium-${chromium.revision}`));
  const hasShell = fs.existsSync(
    path.join(cacheDir, `chromium_headless_shell-${shell.revision}`),
  );

  if (hasChromium && hasShell) {
    results.push(
      formatResult(
        "OK",
        `Playwright Chromium installed in ${cacheDir}`,
      ),
    );
    return true;
  }

  results.push(
    formatResult(
      "FAIL",
      "Playwright browsers missing. Run `npm run test:setup`.",
    ),
  );
  return false;
}

function checkPortFree(results) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
        results.push(
          formatResult(
            "WARN",
            `Could not probe port ${TEST_PORT} in this shell. Verify ${OFFICIAL_BASE_URL} is free on your machine.`,
          ),
        );
        resolve(true);
        return;
      }

      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        results.push(
          formatResult(
            "FAIL",
            `Port ${TEST_PORT} busy. Official suite needs ${OFFICIAL_BASE_URL} free.`,
          ),
        );
        resolve(false);
        return;
      }

      results.push(formatResult("FAIL", `Could not probe port ${TEST_PORT}: ${String(error)}`));
      resolve(false);
    });

    server.listen(TEST_PORT, "127.0.0.1", () => {
      server.close(() => {
        results.push(formatResult("OK", `Port ${TEST_PORT} available for Playwright webServer`));
        resolve(true);
      });
    });
  });
}

function checkEnvWarnings(results) {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    results.push(
      formatResult(
        "WARN",
        `PLAYWRIGHT_BASE_URL=${process.env.PLAYWRIGHT_BASE_URL}. Official suite uses ${OFFICIAL_BASE_URL}.`,
      ),
    );
  }

  if (process.env.VITE_API_URL) {
    results.push(
      formatResult(
        "WARN",
        `VITE_API_URL=${process.env.VITE_API_URL}. Playwright suite forces offline mode anyway.`,
      ),
    );
  }
}

async function main() {
  const pkg = readJson("package.json");
  const results = [];
  const checks = [
    checkNodeVersion(results),
    checkPackageManager(pkg, results),
    checkDependenciesInstalled(results),
    checkPlaywrightVersion(pkg, results),
    checkBrowsersInstalled(results),
    await checkPortFree(results),
  ];

  checkEnvWarnings(results);

  for (const line of results) {
    console.log(line);
  }

  const hasFailure = checks.includes(false);

  if (hasFailure) {
    console.error("");
    console.error("Official flow:");
    console.error("  1. npm ci");
    console.error("  2. npm run test:setup");
    console.error("  3. npm run test:e2e");
    process.exit(1);
  }
}

await main();
