#!/usr/bin/env node
/**
 * AI Arena 本地服务：静态文件 + 动态抓取接口（零依赖，Node >= 18）
 *
 *   GET /api/data      当前缓存数据（data/models.json）
 *   GET /api/refresh   SSE：触发抓取并流式返回进度，结束时推送最新数据
 *
 * 启动：node server.mjs [端口]      默认 http://localhost:5173
 * 环境变量：AUTO_REFRESH_HOURS（默认 6，设为 0 关闭后台自动更新）
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { ROOT, scrape, writeData } from "./scripts/scraper.mjs";

const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const AUTO_HOURS = Number(process.env.AUTO_REFRESH_HOURS ?? 6);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

/* ------------------------- 抓取任务（并发请求共享同一次任务） ------------------------- */
let job = null; // { listeners:Set, last:{msg,pct}, promise }
function startRefresh() {
  if (job) return job;
  const j = { listeners: new Set(), last: { msg: "开始更新 ...", pct: 0 } };
  const emit = (event, data) => j.listeners.forEach((fn) => fn(event, data));
  j.promise = scrape({ onProgress: (p) => { j.last = p; emit("progress", p); } })
    .then(async (payload) => { await writeData(payload); emit("done", payload); return payload; })
    .catch((e) => { emit("fail", { message: e.message }); })
    .finally(() => { job = null; });
  job = j;
  return j;
}

async function readCache() {
  try { return await readFile(join(ROOT, "data/models.json"), "utf8"); } catch { return null; }
}

/* ---------------------------------- HTTP ---------------------------------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/data") {
      const body = await readCache();
      res.writeHead(body ? 200 : 404, { "content-type": MIME[".json"], "cache-control": "no-store" });
      return res.end(body || "{}");
    }
    if (url.pathname === "/api/refresh") {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const j = startRefresh();
      send("progress", j.last);
      const fn = (event, data) => { send(event, data); if (event !== "progress") res.end(); };
      j.listeners.add(fn);
      req.on("close", () => j.listeners.delete(fn));
      return;
    }
    // 静态文件
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/") || p === "") p = join(p, "index.html");
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || /[/\\](scripts|node_modules|\.git)[/\\]/.test(file) || file.endsWith("server.mjs")) {
      res.writeHead(403); return res.end("Forbidden");
    }
    await stat(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`AI Arena 已启动： http://localhost:${PORT}`);
  if (AUTO_HOURS > 0) {
    const check = async () => {
      const cache = await readCache();
      const age = cache ? Date.now() - new Date(JSON.parse(cache).meta.fetchedAt).getTime() : Infinity;
      if (age > AUTO_HOURS * 3600e3) {
        console.log("数据已过期，后台自动更新 ...");
        startRefresh().promise.then(() => console.log("自动更新完成"));
      }
    };
    check();
    setInterval(check, 30 * 60e3).unref();
  }
});
