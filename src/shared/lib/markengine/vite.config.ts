import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Connect, type Plugin } from "vite";

type PreviewRequestPayload = {
  markdown?: unknown;
  viewMode?: unknown;
};

type PreviewResult = {
  html: string;
  ast: unknown;
};

type EngineModule = {
  compileMarkdownToHtml: (
    source: string,
    options: { documentVersion: number },
  ) => PreviewResult;
  compileMarkdownToSourceView: (
    source: string,
    options: { documentVersion: number },
  ) => PreviewResult;
};

const require = createRequire(import.meta.url);
const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(ROOT_DIR, "dist", "markdown.js");

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", rejectBody);
  });
}

function parsePayload(raw: string): PreviewRequestPayload {
  if (raw.trim().length === 0) {
    return {};
  }

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid JSON payload");
  }

  return parsed as PreviewRequestPayload;
}

function loadEngineModule(): EngineModule {
  if (!existsSync(ENGINE_PATH)) {
    throw new Error("Engine build not found. Run npm run build:engine first.");
  }

  const resolvedPath = require.resolve(ENGINE_PATH);
  delete require.cache[resolvedPath];
  const moduleValue: unknown = require(ENGINE_PATH);

  if (
    typeof moduleValue !== "object" ||
    moduleValue === null ||
    typeof (moduleValue as Partial<EngineModule>).compileMarkdownToHtml !==
      "function" ||
    typeof (moduleValue as Partial<EngineModule>)
      .compileMarkdownToSourceView !== "function"
  ) {
    throw new Error("Invalid engine module shape");
  }

  return moduleValue as EngineModule;
}

async function handlePreview(
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const payload = parsePayload(rawBody);
  const source = typeof payload.markdown === "string" ? payload.markdown : "";
  const viewMode = payload.viewMode === "source" ? "source" : "preview";
  const engine = loadEngineModule();
  const result =
    viewMode === "source"
      ? engine.compileMarkdownToSourceView(source, { documentVersion: 1 })
      : engine.compileMarkdownToHtml(source, { documentVersion: 1 });

  sendJson(res, 200, {
    html: result.html,
    ast: result.ast,
    viewMode,
  });
}

function createApiPlugin(): Plugin {
  const registerRoutes = (
    middleware: Connect.Server,
    routeType: "dev" | "preview",
  ): void => {
    middleware.use(async (req: IncomingMessage, res: ServerResponse, next) => {
      if (!req.url) {
        next();
        return;
      }

      if (req.url === "/api/health") {
        sendJson(res, 200, { ok: true, mode: routeType });
        return;
      }

      if (req.method !== "POST" || req.url !== "/api/preview") {
        next();
        return;
      }

      try {
        const rawBody = await readBody(req);
        await handlePreview(res, rawBody);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Invalid request";
        sendJson(res, 400, { error: message });
      }
    });
  };

  return {
    name: "markengine-api",
    configureServer(server) {
      registerRoutes(server.middlewares, "dev");
    },
    configurePreviewServer(server) {
      registerRoutes(server.middlewares, "preview");
    },
  };
}

export default defineConfig({
  root: "playground/public",
  plugins: [createApiPlugin()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
  },
});
