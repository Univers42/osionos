import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import process from "node:process";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const isWindows = process.platform === "win32";
const requiredPackages = ["vite", "playwright", "@playwright/test"];

function resolveCommand(command) {
  return isWindows ? `${command}.cmd` : command;
}

function resolvePackage(packageName) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [rootDir] });
  } catch {
    return null;
  }
}

function hasRequiredPackages() {
  return requiredPackages.every((packageName) => resolvePackage(packageName));
}

function runCommand(command, args, stepLabel) {
  return new Promise((resolve, reject) => {
    console.log(`[browser-test-setup] ${stepLabel}`);
    const child = spawn(resolveCommand(command), args, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function ensureNodeDependencies() {
  if (hasRequiredPackages()) {
    console.log("[browser-test-setup] Node dependencies already available.");
    return;
  }

  await runCommand(
    "npm",
    ["install"],
    "Installing project dependencies required for browser tests...",
  );

  if (!hasRequiredPackages()) {
    throw new Error(
      "Browser test dependencies are still missing after npm install.",
    );
  }
}

async function ensureChromiumBrowser() {
  const { chromium } = await import("playwright");
  const executablePath = chromium.executablePath();

  if (executablePath && existsSync(executablePath)) {
    console.log("[browser-test-setup] Playwright Chromium already available.");
    return;
  }

  await runCommand(
    "npx",
    ["playwright", "install", "chromium"],
    "Installing Playwright Chromium browser...",
  );
}

async function main() {
  await ensureNodeDependencies();
  await ensureChromiumBrowser();
}

main().catch((error) => {
  console.error("[browser-test-setup] Setup failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
