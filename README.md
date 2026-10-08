# AI Arena

自由勾选任意多个大模型，一页对比 [Artificial Analysis](https://artificialanalysis.ai) 上的全部指标（智能、各项评测、价格、速度、延迟、上下文、提供商等）。纯 HTML / JS，**零第三方依赖**。

## 使用

```bash
node server.mjs          # 或 npm start，打开 http://localhost:5173
```

- 页面右上角 **🔄 更新数据**：实时从 Artificial Analysis 抓取最新的模型列表与指标（自动发现新模型 / 新 release），带进度条，已勾选的模型会保留，新增模型在列表中标 `NEW`。
- 服务启动时若数据超过 6 小时会**后台自动更新**（`AUTO_REFRESH_HOURS=0` 关闭，或设置其他小时数）。
- 也可手动命令行更新：`npm run update`。
- 直接双击 `index.html`（file://）也能用，展示的是上次抓取的快照；浏览器无法跨域直接请求目标站点，所以在线更新需要经由 `server.mjs`。

## 功能

- 模型按厂商 → 系列 → 推理强度（max / high / low …）分组，支持搜索、厂商筛选、整个系列一键勾选
- 快捷预设：智能 Top 5、各厂商旗舰、最快 / 最省、开源 Top 5
- 指标矩阵：最优 / 最差高亮、条形、仅看差异项、按指标排序、分区折叠
- 智能指数 vs 成本散点图（对数坐标）
- 导出 CSV、分享链接（选中的模型编码在 URL hash 中），选择自动记忆

## 结构

```
index.html  css/style.css  js/app.js      前端
server.mjs                                静态服务 + /api/data + /api/refresh(SSE)
scripts/scraper.mjs                       抓取与解析（排行榜 + 各 release 对比页）
scripts/fetch-data.mjs                    命令行更新入口
data/models.{js,json}                     抓取结果缓存
```

> 仅有排行榜核心指标（上下文 / 智能 / 成本 / 速度 / 延迟）的模型会标记「基础数据」——站点没有为它们提供对比页。
