const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ENGINE_PATH = path.join(__dirname, "..", "dist", "markdown.js");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, "public");

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath)) {
    send(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApiPreview(req, res) {
  try {
    const raw = await readBody(req);
    const payload = raw ? JSON.parse(raw) : {};
    const source = typeof payload.markdown === "string" ? payload.markdown : "";
    delete require.cache[require.resolve(ENGINE_PATH)];
    const { compileMarkdownToHtml } = require(ENGINE_PATH);
    const result = compileMarkdownToHtml(source, { documentVersion: 1 });

    sendJson(res, 200, {
      html: result.html,
      ast: result.ast,
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );

  if (req.method === "POST" && url.pathname === "/api/preview") {
    handleApiPreview(req, res);
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const filePath =
    url.pathname === "/"
      ? path.join(ROOT, "index.html")
      : path.join(ROOT, url.pathname);

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Markdown playground running at http://localhost:${PORT}`);
});
