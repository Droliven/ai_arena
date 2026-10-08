#!/usr/bin/env node
/**
 * 从 artificialanalysis.ai 抓取模型数据，生成 data/models.js 与 data/models.json
 *
 * 数据来源：
 *   1. /leaderboards/models                    -> 全部模型的核心指标（上下文 / 智能指数 / 成本 / 速度 / 延迟）
 *   2. /models/releases                        -> 所有 release 的 slug
 *   3. /models/releases/comparisons/A-vs-B     -> 每个 release 下各 effort 档位的完整指标
 *
 * 作为模块使用：import { scrape, writeData } from "./scraper.mjs"
 * 命令行使用：   node scripts/fetch-data.mjs   （需要 Node >= 18，无任何第三方依赖）
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://artificialanalysis.ai";
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, { retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { "user-agent": UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw new Error(`GET ${path} failed: ${e.message}`);
      await sleep(800 * (i + 1));
    }
  }
}

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const clean = (v) => (v === "" || v === "--" || v === "\\--" ? null : v);

/* ---------------------------------- 排行榜 --------------------------------- */
function parseLeaderboard(html) {
  const out = [];
  for (const tr of html.split("<tr").slice(1)) {
    const cells = tr.match(/<td[\s\S]*?<\/td>/g);
    if (!cells || cells.length < 9) continue;
    const slug = (cells[cells.length - 1].match(/href="\/models\/([^"\/]+)"/) || [])[1];
    if (!slug) continue;
    const t = cells.map(text);
    out.push({
      slug,
      name: t[0],
      context: clean(t[1]),
      creator: t[2],
      index: clean(t[3]),
      cost: clean(t[4]),
      speed: clean(t[5]),
      ttft: clean(t[6]),
      e2e: clean(t[7]),
    });
  }
  return out;
}

/* ------------------------------- release 列表 ------------------------------- */
function parseReleaseSlugs(html) {
  return [...new Set([...html.matchAll(/href="\/models\/releases\/([^"\/]+)"/g)].map((m) => m[1]))];
}

/* ------------------------------- 对比页表格 -------------------------------- */
function parseComparison(html) {
  const tableHtml = (html.match(/<table[\s\S]*?<\/table>/) || [])[0];
  if (!tableHtml) return null;

  const thead = tableHtml.match(/<thead[\s\S]*?<\/thead>/)[0];
  const cols = [...thead.matchAll(/<th[^>]*>\s*<a[^>]*href="\/models\/([^"\/]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    slug: m[1],
    name: text(m[2]),
  }));
  if (!cols.length) return null;

  const rows = [];
  let section = "";
  for (const tr of tableHtml.match(/<tr[\s\S]*?<\/tr>/g)) {
    if (tr.includes("<thead")) continue;
    if (/<th[^>]*colSpan/i.test(tr) || /<th[^>]*colspan/i.test(tr)) {
      section = text(tr.match(/<th[\s\S]*?<\/th>/)[0]);
      continue;
    }
    const th = tr.match(/<th scope="row"[\s\S]*?<\/th>/);
    if (!th) continue;
    const spans = [...th[0].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    const label = spans[0];
    if (!label) continue;
    const unit = spans[1] || "";
    const cells = (tr.match(/<td[\s\S]*?<\/td>/g) || []).map((td) => {
      const alts = [...td.matchAll(/<img[^>]*alt="([^"]*)"/g)].map((m) => decode(m[1]));
      const t = text(td);
      if (label === "Providers") return alts.length ? [...new Set(alts)].join(", ") : null;
      return clean(t);
    });
    rows.push({ section, label, unit, cells });
  }
  return { cols, rows };
}

/* ---------------------------------- 主流程 ---------------------------------- */
export async function scrape({ onProgress = () => {} } = {}) {
  const log = (msg, pct) => onProgress({ msg, pct });
  log("抓取排行榜 ...", 2);
  const lbHtml = await get("/leaderboards/models");
  const leaderboard = parseLeaderboard(lbHtml);
  if (leaderboard.length < 20) throw new Error(`排行榜解析异常（仅 ${leaderboard.length} 行），页面结构可能已变化，已放弃更新`);
  log(`排行榜共 ${leaderboard.length} 个模型`, 10);

  log("抓取 release 列表 ...", 12);
  const releases = parseReleaseSlugs(await get("/models/releases"));
  log(`发现 ${releases.length} 个 release，开始抓取详情 ...`, 15);

  const details = new Map(); // model slug -> { label: value }
  const metricMeta = new Map(); // label -> { section, unit }
  const coveredReleases = new Set();
  const failed = [];

  async function tryPair(a, b) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const html = await get(`/models/releases/comparisons/${x}-vs-${y}`);
      await sleep(250);
      if (!html) continue;
      const parsed = parseComparison(html);
      if (!parsed) continue;
      parsed.cols.forEach((c, i) => {
        const rec = details.get(c.slug) || { __name: c.name };
        for (const r of parsed.rows) {
          if (!metricMeta.has(r.label)) metricMeta.set(r.label, { section: r.section, unit: r.unit });
          if (r.cells[i] != null) rec[r.label] = r.cells[i];
        }
        details.set(c.slug, rec);
      });
      coveredReleases.add(a).add(b);
      log(`✓ ${x} vs ${y} (${parsed.cols.length} 个模型)`, 15 + Math.min(80, (coveredReleases.size / releases.length) * 80));
      return true;
    }
    return false;
  }

    for (const r of releases) {
    if (coveredReleases.has(r)) continue;
    const candidates = [
      ...releases.filter((x) => x !== r && !coveredReleases.has(x)),
      ...releases.filter((x) => x !== r && coveredReleases.has(x)),
    ].slice(0, 8);
    let ok = false;
    for (const c of candidates) {
      if (await tryPair(r, c)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      failed.push(r);
      log(`✗ ${r} 无可用对比页，仅使用排行榜数据`);
    }
  }

  /* ----------------------------- 合并排行榜与详情 ----------------------------- */
  const models = [];
  const seen = new Set();
  const mk = (slug, name, creator) => ({ slug, name, creator, metrics: {} });

  for (const lb of leaderboard) {
    if (seen.has(lb.slug)) continue;
    seen.add(lb.slug);
    const m = mk(lb.slug, lb.name, lb.creator);
    const base = {
      "Context Window": lb.context,
      "Intelligence Index": lb.index,
      "Cost per Task": lb.cost,
      "Output Speed": lb.speed,
      "Time to First Token": lb.ttft,
      "End-to-End Response Time": lb.e2e,
      Creator: lb.creator,
    };
    for (const [k, v] of Object.entries(base)) if (v != null) m.metrics[k] = v;
    const d = details.get(lb.slug);
    if (d) {
      const { __name, ...rest } = d;
      Object.assign(m.metrics, rest); // 详情页数据优先
      m.detailed = true;
    }
    models.push(m);
  }
  // 只在对比页出现、不在排行榜里的模型
  for (const [slug, d] of details) {
    if (seen.has(slug)) continue;
    const { __name, ...rest } = d;
    const m = mk(slug, __name, rest.Creator || "");
    m.metrics = rest;
    m.detailed = true;
    models.push(m);
  }

  // 清理：智能指数里的 "*" 标记（表示估算值）
  for (const m of models) {
    const idx = m.metrics["Intelligence Index"];
    if (idx && idx.endsWith("*")) {
      m.metrics["Intelligence Index"] = idx.slice(0, -1);
      m.estimated = true;
    }
  }

  const payload = {
    meta: {
      source: BASE + "/leaderboards/models",
      fetchedAt: new Date().toISOString(),
      modelCount: models.length,
      detailedCount: models.filter((m) => m.detailed).length,
    },
    metrics: [...metricMeta].map(([label, v]) => ({ label, ...v })),
    models,
  };

  payload.meta.failedReleases = failed;
  return payload;
}

/** 把抓取结果写入 data/models.json 与 data/models.js（后者供 file:// 直接打开使用） */
export async function writeData(payload) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(join(ROOT, "data/models.json"), JSON.stringify(payload, null, 1));
  await writeFile(join(ROOT, "data/models.js"), "window.AA_DATA = " + JSON.stringify(payload) + ";\n");
}
