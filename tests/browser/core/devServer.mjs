import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import net from "node:net";

const require = createRequire(import.meta.url);
const isWindows = process.platform === "win32";
const vitePackagePath = require.resolve("vite/package.json");
const vitePackage = require(vitePackagePath);
const viteBinPath = path.join(
  path.dirname(vitePackagePath),
  typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin.vite,
);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve a free port")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForServer(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for ${url}${lastError ? `: ${String(lastError)}` : ""}`,
  );
}

async function stopDevServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  terminateProcessGroup(child.pid, "SIGTERM");
  const killedGracefully = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (!killedGracefully && child.exitCode === null) {
    terminateProcessGroup(child.pid, "SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

function terminateProcessGroup(pid, signal) {
  if (!pid) {
    return;
  }

  try {
    if (isWindows) {
      process.kill(pid, signal);
      return;
    }

    process.kill(-pid, signal);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return;
    }
    throw error;
  }
}

export async function startDevServer({ cwd }) {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/`;
  const output = [];
  const child = spawn(
    process.execPath,
    [
      viteBinPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd,
      env: {
        ...process.env,
        BROWSER: "none",
        CI: "1",
      },
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const capture = (chunk) => {
    output.push(chunk.toString());
    if (output.length > 40) {
      output.shift();
    }
  };

  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  try {
    await waitForServer(url, 45_000, child);
  } catch (error) {
    await stopDevServer(child);
    const logTail = output.join("").trim();
    throw new Error(
      `Could not start the dev server.${logTail ? `\n\n${logTail}` : ""}\n\n${String(error)}`,
    );
  }

  return {
    url,
    async close() {
      await stopDevServer(child);
    },
  };
}
