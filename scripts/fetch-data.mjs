#!/usr/bin/env node
// 命令行手动更新数据：node scripts/fetch-data.mjs
import { scrape, writeData } from "./scraper.mjs";

const payload = await scrape({
  onProgress: ({ msg, pct }) => console.log(`${pct != null ? String(Math.round(pct)).padStart(3) + "% " : "     "}${msg}`),
});
await writeData(payload);
console.log(`\n完成：${payload.meta.modelCount} 个模型，其中 ${payload.meta.detailedCount} 个带完整指标。`);
if (payload.meta.failedReleases.length) console.log("未取得详情的 release:", payload.meta.failedReleases.join(", "));
