// Local dev server: static files from public/ + the same handlers Vercel runs.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { handleCases, handleRun } from "./lib/handler.js";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
const PORT = Number(process.env.PORT || 5174);

async function toNode(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/cases") return toNode(res, await handleCases());
    if (url.pathname === "/api/run" && req.method === "POST") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const request = new Request("http://x/api/run", { method: "POST", body: Buffer.concat(chunks), headers: { "content-type": "application/json" } });
      return toNode(res, await handleRun(request));
    }
    const p = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    try {
      const buf = await readFile(join("public", p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, () => console.log(`EXHIBIT A on http://localhost:${PORT}`));
