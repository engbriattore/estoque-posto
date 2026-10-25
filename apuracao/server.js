import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tse.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(root, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function safeFile(pathname) {
  let rel = pathname === "/" ? "index.html" : pathname;
  try {
    rel = decodeURIComponent(rel).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!rel || rel.includes("\0") || rel.includes("..")) return null;
  const full = resolve(publicDir, rel);
  if (full !== publicDir && !full.startsWith(publicDir + sep)) return null;
  return full;
}

export function createApp({ load } = {}) {
  const loader = load ? { load } : createLoader();

  return async function app(req, res) {
    const url = new URL(req.url || "/", "http://localhost");
    try {
      if (url.pathname === "/api/apuracao") {
        const data = await loader.load({ fresh: url.searchParams.get("fresco") === "1" });
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        res.end(JSON.stringify(data));
        return;
      }

      if (url.pathname === "/api/saude") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      const file = safeFile(url.pathname);
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Não encontrado");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=300",
        "x-content-type-options": "nosniff",
      });
      res.end(body);
    } catch (error) {
      if (error?.code === "ENOENT") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Não encontrado");
        return;
      }
      const message = error?.name === "AbortError"
        ? "O TSE demorou para responder."
        : "Não foi possível ler a apuração agora.";
      res.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ erro: message }));
    }
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer(createApp());
  server.listen(port, "0.0.0.0", () => {
    console.log(`Apuração no ar em http://localhost:${port}`);
  });
}
