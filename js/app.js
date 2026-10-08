(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  指标定义：dir = high（越高越好）/ low（越低越好）/ undefined（不比较）
   *  text = true 表示文本型指标
   * ------------------------------------------------------------------ */
  const SECTION_ZH = { Intelligence: "智能", Cost: "成本", Performance: "性能", Features: "特性" };
  const M = {
    "Intelligence Index": { zh: "智能指数", dir: "high" },
    "Finance & Accounting": { zh: "金融与会计", dir: "high" },
    "Strategy & Ops": { zh: "战略与运营", dir: "high" },
    Legal: { zh: "法律", dir: "high" },
    "Healthcare & Medical": { zh: "医疗健康", dir: "high" },
    Engineering: { zh: "工程", dir: "high" },
    Economics: { zh: "经济学", dir: "high" },
    "AA-Briefcase v1.1": { zh: "AA-Briefcase（办公任务 Elo）", dir: "high" },
    "GDPval-AA v2.1": { zh: "GDPval-AA（职业任务 Elo）", dir: "high" },
    "AutomationBench-AA": { zh: "AutomationBench（自动化）", dir: "high" },
    "Terminal-Bench 4.0": { zh: "Terminal-Bench（终端智能体）", dir: "high" },
    SciCode: { zh: "SciCode（科学编程）", dir: "high" },
    "Humanity's Last Exam": { zh: "人类最后的考试 HLE", dir: "high" },
    "GDP.pdf": { zh: "GDP.pdf（文档理解）", dir: "high" },
    CritPt: { zh: "CritPt（物理推理）", dir: "high" },
    "AA-Omniscience": { zh: "AA-Omniscience（知识与幻觉）", dir: "high" },
    "AA-LCR v1.1": { zh: "AA-LCR（长上下文推理）", dir: "high" },
    "Cost per Task": { zh: "单任务成本", dir: "low" },
    "Input Price": { zh: "输入价格", dir: "low" },
    "Output Price": { zh: "输出价格", dir: "low" },
    "Cache Hit Price": { zh: "缓存命中价格", dir: "low" },
    "Cache Write Price": { zh: "缓存写入价格", dir: "low" },
    "Output Speed": { zh: "输出速度", dir: "high" },
    "Time to First Token": { zh: "首 token 延迟", dir: "low" },
    "Time to First Answer Token": { zh: "首个回答 token 延迟", dir: "low" },
    "End-to-End Response Time": { zh: "端到端响应时间", dir: "low" },
    "Time per Task": { zh: "单任务耗时", dir: "low" },
    "Context Window": { zh: "上下文窗口", dir: "high" },
    Creator: { zh: "厂商", text: true },
    License: { zh: "许可", text: true },
    "Input Modality": { zh: "输入模态", text: true },
    "Output Modality": { zh: "输出模态", text: true },
    Providers: { zh: "API 提供商", text: true },
  };
  const PALETTE = ["#4f6bff", "#f5a524", "#12a150", "#e5484d", "#8e4ec6", "#0ea5b7", "#d6409f", "#7c8a00", "#ff7a3d", "#3b82f6", "#64748b", "#a16207"];

  /* ------------------------------ 状态 ------------------------------- */
  let DATA, MODELS, BY_SLUG, NEW_SLUGS = new Set();
  let selected = []; // slug[]
  const colorOf = new Map();
  const openCreators = new Set();
  const collapsedSections = new Set();

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };

  /* ------------------------------ 数据层 ------------------------------ */
  function famOf(m) {
    const mt = m.name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    return mt ? { family: mt[1], variant: mt[2] } : { family: m.name, variant: "" };
  }
  const EFFORT = { low: 1, minimal: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
  const shortVar = (m) => (m.variant || "").replace(/\s*with fallback/i, "").trim();
  const effortRank = (m) => EFFORT[shortVar(m).split(/[ ,]/)[0].toLowerCase()] ?? 0;
  /** 简短显示名：Claude Opus 5.5 · high */
  const shortName = (m) => (shortVar(m) ? `${m.family} · ${shortVar(m)}` : m.family);
  function setData(d) {
    DATA = d;
    MODELS = d.models.map((m) => Object.assign(m, famOf(m), { fkey: m.creator + "::" + famOf(m).family }));
    BY_SLUG = new Map(MODELS.map((m) => [m.slug, m]));
  }
  function num(raw, label) {
    if (raw == null) return null;
    if (label === "Context Window") {
      const mt = String(raw).match(/^([\d.]+)\s*([kKmM])?$/);
      if (!mt) return null;
      return parseFloat(mt[1]) * (mt[2] ? (mt[2].toLowerCase() === "m" ? 1e6 : 1e3) : 1);
    }
    const v = parseFloat(String(raw).replace(/[$,%]/g, ""));
    return Number.isFinite(v) ? v : null;
  }
  const val = (m, label) => num(m.metrics[label], label);
  const idxOf = (m) => val(m, "Intelligence Index");

  /* 指标行（保持站点顺序，未知指标自动追加） */
  function metricRows() {
    const rows = [];
    const seen = new Set();
    for (const r of DATA.metrics) {
      seen.add(r.label);
      rows.push({ label: r.label, section: r.section || "Other", unit: r.unit || "" });
    }
    for (const m of MODELS) for (const k of Object.keys(m.metrics)) if (!seen.has(k)) { seen.add(k); rows.push({ label: k, section: "Other", unit: "" }); }
    return rows;
  }

  /* ------------------------------ 选择状态 ----------------------------- */
  const HUES = [222, 28, 148, 352, 274, 186, 322, 62, 12, 204, 100, 244];
  const shade = new Map(); // slug -> css color
  /** 颜色：不同系列不同色相；同一系列按推理强度由强到弱，同色相、由深到浅 */
  function assignColors(next) {
    const fks = [...new Set(next.map((sl) => BY_SLUG.get(sl).fkey))];
    for (const k of [...colorOf.keys()]) if (!fks.includes(k)) colorOf.delete(k);
    const used = new Set(colorOf.values());
    for (const k of fks) {
      if (colorOf.has(k)) continue;
      let i = 0;
      while (used.has(i)) i++;
      colorOf.set(k, i); used.add(i);
    }
    shade.clear();
    for (const k of fks) {
      const vs = next.map((sl) => BY_SLUG.get(sl)).filter((m) => m.fkey === k)
        .sort((a, b) => effortRank(b) - effortRank(a) || (idxOf(b) ?? -1) - (idxOf(a) ?? -1));
      const hue = HUES[colorOf.get(k) % HUES.length];
      vs.forEach((m, i) => {
        const t = vs.length > 1 ? i / (vs.length - 1) : 0;
        shade.set(m.slug, `hsl(${hue} ${Math.round(72 - t * 14)}% ${Math.round(38 + t * 30)}%)`);
      });
    }
  }
  const colorFor = (slug) => shade.get(slug) || "#8a92a8";

  function setSelected(list) {
    const next = [...new Set(list)].filter((s) => BY_SLUG.has(s));
    assignColors(next);
    selected = next;
    persist();
    syncChecks();
    renderMain();
  }
  const toggle = (slug, on) => setSelected(on ? [...selected, slug] : selected.filter((s) => s !== slug));
  function persist() {
    try { localStorage.setItem("aa-selected", JSON.stringify(selected)); } catch {}
    const h = selected.length ? "#m=" + selected.join(",") : "";
    history.replaceState(null, "", location.pathname + location.search + h);
  }
  function loadInitial() {
    const m = location.hash.match(/#m=([^&]+)/);
    if (m) return m[1].split(",").map(decodeURIComponent);
    try { return JSON.parse(localStorage.getItem("aa-selected") || "[]"); } catch { return []; }
  }

  /* ------------------------------ 侧边栏 ------------------------------ */
  let visibleFamilies = [];
  function buildList() {
    const q = $("search").value.trim().toLowerCase();
    const cr = $("creator-filter").value;
    const onlyDetail = $("only-detail").checked;
    const list = MODELS.filter((m) => {
      if (cr && m.creator !== cr) return false;
      if (onlyDetail && !m.detailed) return false;
      if (q && !(m.name + " " + m.creator).toLowerCase().includes(q)) return false;
      return true;
    });

    const byCreator = new Map();
    for (const m of list) {
      if (!byCreator.has(m.creator)) byCreator.set(m.creator, new Map());
      const fams = byCreator.get(m.creator);
      if (!fams.has(m.fkey)) fams.set(m.fkey, []);
      fams.get(m.fkey).push(m);
    }
    const best = (arr) => Math.max(...arr.map((m) => idxOf(m) ?? -1));
    const creators = [...byCreator].map(([name, fams]) => {
      const famArr = [...fams.values()].map((v) => v.sort((a, b) => (idxOf(b) ?? -1) - (idxOf(a) ?? -1)));
      famArr.sort((a, b) => best(b) - best(a));
      return { name, famArr, top: Math.max(...famArr.map(best)) };
    }).sort((a, b) => b.top - a.top);

    if (!openCreators.size && !q) creators.slice(0, 6).forEach((c) => openCreators.add(c.name));
    visibleFamilies = creators.flatMap((c) => c.famArr);

    const box = $("model-list");
    box.replaceChildren();
    if (!creators.length) box.append(el("div", { class: "no-result" }, "没有匹配的模型"));

    for (const c of creators) {
      const count = c.famArr.reduce((n, f) => n + f.length, 0);
      const d = el("details", { class: "creator", "data-creator": c.name });
      d.open = !!q || openCreators.has(c.name);
      d.addEventListener("toggle", () => { if (!q) d.open ? openCreators.add(c.name) : openCreators.delete(c.name); });
      d.append(el("summary", {}, c.name, el("span", { class: "sel-count", "data-selcount": c.name }), el("span", { class: "count" }, String(count))));
      for (const fam of c.famArr) {
        if (fam.length > 1) {
          d.append(el("label", { class: "item family" },
            el("input", { type: "checkbox", "data-family": fam[0].fkey, onchange: (e) => famToggle(fam, e.target.checked) }),
            el("span", { class: "nm", "data-n": `· ${fam.length} 档`, text: fam[0].family }),
            el("span", { class: "ix", text: "最高 " + (best(fam) >= 0 ? best(fam) : "—") })));
          for (const m of fam) d.append(itemRow(m, true));
        } else d.append(itemRow(fam[0], false));
      }
      box.append(d);
    }
    $("side-count").textContent = `共 ${list.length} / ${MODELS.length} 个模型 · 已选 ${selected.length}`;
    syncChecks();
  }
  function itemRow(m, isVariant) {
    return el("label", { class: "item" + (isVariant ? " variant" : ""), title: m.name },
      el("input", { type: "checkbox", "data-slug": m.slug, onchange: (e) => toggle(m.slug, e.target.checked) }),
      el("span", { class: "nm", text: isVariant ? m.variant || "默认" : m.name }),
      NEW_SLUGS.has(m.slug) ? el("span", { class: "new" }, "NEW") : null,
      !m.detailed ? el("span", { class: "lite", title: "仅排行榜基础数据" }, "基础") : null,
      el("span", { class: "ix", text: m.metrics["Intelligence Index"] ?? "—" }));
  }
  function famToggle(fam, on) {
    const slugs = fam.map((m) => m.slug);
    setSelected(on ? [...selected, ...slugs] : selected.filter((s) => !slugs.includes(s)));
  }
  function syncChecks() {
    const set = new Set(selected);
    document.querySelectorAll("#model-list input[data-slug]").forEach((i) => {
      i.checked = set.has(i.dataset.slug);
      i.closest(".item").classList.toggle("on", i.checked);
    });
    for (const fam of visibleFamilies) {
      if (fam.length < 2) continue;
      const i = document.querySelector(`#model-list input[data-family="${CSS.escape(fam[0].fkey)}"]`);
      if (!i) continue;
      const n = fam.filter((m) => set.has(m.slug)).length;
      i.checked = n === fam.length;
      i.indeterminate = n > 0 && n < fam.length;
    }
    document.querySelectorAll("[data-selcount]").forEach((s) => {
      const n = selected.filter((sl) => BY_SLUG.get(sl).creator === s.dataset.selcount).length;
      s.textContent = n ? `已选 ${n}` : "";
    });
    const cnt = $("side-count").textContent.replace(/已选 \d+/, "已选 " + selected.length);
    $("side-count").textContent = cnt;
  }

  function buildCreatorFilter() {
    const cur = $("creator-filter").value;
    const counts = new Map();
    MODELS.forEach((m) => counts.set(m.creator, (counts.get(m.creator) || 0) + 1));
    const sel = $("creator-filter");
    sel.replaceChildren(el("option", { value: "" }, `全部厂商 (${counts.size})`));
    [...counts].sort((a, b) => b[1] - a[1]).forEach(([c, n]) => sel.append(el("option", { value: c }, `${c} (${n})`)));
    sel.value = counts.has(cur) ? cur : "";
  }

  function buildPresets() {
    const pool = (opts = {}) => MODELS.filter((m) => idxOf(m) != null && (!opts.detailed || m.detailed));
    const presets = [
      ["🏆 智能 Top 5", () => pool().sort((a, b) => idxOf(b) - idxOf(a)).slice(0, 5)],
      ["🏢 各厂商旗舰", () => {
        const best = new Map();
        pool().forEach((m) => { const b = best.get(m.creator); if (!b || idxOf(m) > idxOf(b)) best.set(m.creator, m); });
        return [...best.values()].sort((a, b) => idxOf(b) - idxOf(a)).slice(0, 8);
      }],
      ["⚡ 最快 5（智能≥30）", () => pool().filter((m) => idxOf(m) >= 30 && val(m, "Output Speed") != null).sort((a, b) => val(b, "Output Speed") - val(a, "Output Speed")).slice(0, 5)],
      ["💰 最省 5（智能≥30）", () => pool().filter((m) => idxOf(m) >= 30 && val(m, "Cost per Task") != null).sort((a, b) => val(a, "Cost per Task") - val(b, "Cost per Task")).slice(0, 5)],
      ["🔓 开源 Top 5", () => MODELS.filter((m) => idxOf(m) != null && /open/i.test(m.metrics.License || "")).sort((a, b) => idxOf(b) - idxOf(a)).slice(0, 5)],
    ];
    $("presets").replaceChildren(...presets.map(([t, f]) => el("button", { class: "preset", onclick: () => setSelected(f().map((m) => m.slug)) }, t)));
  }

  /* ------------------------------ 主区域 ------------------------------ */
  /** 系列分组顺序：系列按最高智能指数降序，组内按推理强度从高到低 */
  function sortedSelected() {
    const arr = selected.map((s) => BY_SLUG.get(s));
    const top = new Map();
    arr.forEach((m) => top.set(m.fkey, Math.max(top.get(m.fkey) ?? -1, idxOf(m) ?? -1)));
    return arr.sort((a, b) => top.get(b.fkey) - top.get(a.fkey) || (a.fkey < b.fkey ? -1 : a.fkey > b.fkey ? 1 : 0)
      || effortRank(b) - effortRank(a) || (idxOf(b) ?? -1) - (idxOf(a) ?? -1));
  }

  const COST = "Cost per Task";
  const money = (v) => "$" + (v < 0.01 ? v.toFixed(4) : v < 10 ? v.toFixed(2) : v.toFixed(1));

  /** 性价比分析：Pareto 前沿（没有任何模型「又便宜又强」的模型）与被取代关系 */
  function analyze(ms) {
    const pts = ms.filter((m) => val(m, COST) > 0 && idxOf(m) != null);
    const front = [], dom = new Map();
    for (const a of pts) {
      const ca = val(a, COST), ia = idxOf(a);
      const ds = pts.filter((b) => b !== a && val(b, COST) <= ca && idxOf(b) >= ia && (val(b, COST) < ca || idxOf(b) > ia));
      if (ds.length) dom.set(a.slug, ds.sort((x, y) => idxOf(y) - idxOf(x) || val(x, COST) - val(y, COST))[0]);
      else front.push(a);
    }
    front.sort((a, b) => val(a, COST) - val(b, COST));
    return { pts, front, dom, frontSet: new Set(front.map((m) => m.slug)) };
  }

  function renderMain() {
    const has = selected.length > 0;
    $("empty").hidden = has;
    $("result").hidden = !has;
    $("side-count").textContent = $("side-count").textContent.replace(/已选 \d+/, "已选 " + selected.length);
    if (!has) return;
    const ms = sortedSelected();
    const an = analyze(ms);
    renderChips(ms);
    renderVerdict(ms, an);
    renderScatter(ms, an);
    renderLadder(an);
    renderScenarios(ms);
    renderCharts(ms, an);
  }

  /** 已选模型：每个系列一个 chip，推理强度作为可单独移除的小标签 */
  function renderChips(ms) {
    const groups = new Map();
    ms.forEach((m) => { if (!groups.has(m.fkey)) groups.set(m.fkey, []); groups.get(m.fkey).push(m); });
    $("chips").replaceChildren(...[...groups.values()].map((g) => {
      const multi = g.length > 1 || shortVar(g[0]);
      return el("span", { class: "chip", style: `border-left-color:${colorFor(g[0].slug)}` },
        el("b", {}, g[0].family),
        multi ? g.map((m) => el("span", { class: "vtag", title: m.name }, shortVar(m) || "默认", el("button", { title: "移除", onclick: () => toggle(m.slug, false) }, "×"))) : null,
        !multi ? el("button", { class: "chip-x", title: "移除", onclick: () => toggle(g[0].slug, false) }, "×") : null,
        g.length > 1 ? el("button", { class: "chip-x", title: "移除整个系列", onclick: () => setSelected(selected.filter((s) => BY_SLUG.get(s).fkey !== g[0].fkey)) }, "⊗") : null);
    }));
  }

  /* ---------- 结论：先告诉用户「该选谁」 ---------- */
  function renderVerdict(ms, an) {
    const withIdx = ms.filter((m) => idxOf(m) != null);
    const cards = [];
    const card = (cls, title, big, m, sub) => el("div", { class: "card " + cls },
      el("div", { class: "k" }, title), el("div", { class: "v" }, big),
      el("div", { class: "who", title: m.name }, el("span", { class: "swatch", style: `background:${colorFor(m.slug)}` }), shortName(m)),
      el("div", { class: "sub2" }, sub));

    const by = (arr, f, dir) => arr.reduce((a, b) => (dir > 0 ? f(b) > f(a) : f(b) < f(a)) ? b : a);
    let strongest = null;
    if (withIdx.length) {
      strongest = withIdx.reduce((a, b) => (idxOf(b) > idxOf(a) || (idxOf(b) === idxOf(a) && (val(b, COST) ?? 1e9) < (val(a, COST) ?? 1e9))) ? b : a);
      cards.push(card("c-top", "🧠 最强", idxOf(strongest), strongest, val(strongest, COST) != null ? `智能指数 · 单任务成本 ${money(val(strongest, COST))}` : "智能指数"));
      const enough = an.pts.filter((m) => idxOf(m) >= idxOf(strongest) * 0.9);
      if (enough.length) {
        const w = by(enough, (m) => val(m, COST), -1);
        const same = w === strongest;
        cards.push(card("c-value", "⚖ 够用且最省", money(val(w, COST)), w,
          same ? "最强者本身就是最省的" : `智能 ${idxOf(w)}，达到最强的 ${Math.round((idxOf(w) / idxOf(strongest)) * 100)}%`));
      }
    }
    const fast = ms.filter((m) => val(m, "Output Speed") != null);
    if (fast.length) { const w = by(fast, (m) => val(m, "Output Speed"), 1); cards.push(card("c-fast", "⚡ 输出最快", val(w, "Output Speed") + " t/s", w, idxOf(w) != null ? `智能 ${idxOf(w)}` : "")); }
    const cheap = an.pts;
    if (cheap.length) { const w = by(cheap, (m) => val(m, COST), -1); cards.push(card("c-cheap", "💰 单任务最便宜", money(val(w, COST)), w, `智能 ${idxOf(w)}`)); }
    $("cards").replaceChildren(...cards);

    const n = an.pts.length, f = an.front.length, d = an.dom.size;
    let txt;
    if (n < 2) txt = "至少选择 2 个带「成本 + 智能指数」数据的模型，才能给出性价比结论。";
    else if (!d) txt = `这 ${n} 个模型互不取代：每一个都在「更强」与「更省」之间各有取舍，见下方「性价比阶梯」。`;
    else txt = `${n} 个模型里有 ${d} 个存在「更省且不弱」的替代项（图中空心点）；其余 ${f} 个构成性价比前沿，可结合预算和场景参考。`;
    const missing = ms.length - n;
    $("insight").textContent = txt + (missing ? ` 另有 ${missing} 个模型缺少成本或智能数据，未参与性价比判断。` : "");
  }

  /* ---------- 智能 vs 成本：同系列连线（推理强度曲线），前沿实心 / 被取代空心 ---------- */
  function renderScatter(ms, an) {
    const pts = an.pts.map((m) => ({ m, x: val(m, COST), y: idxOf(m) }));
    const W = 640, H = 360, L = 44, R = 18, T = 14, B = 40;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const S = (tag, a, txt, parent = svg) => { const n = document.createElementNS(svg.namespaceURI, tag); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; parent.append(n); return n; };
    if (pts.length < 1) {
      S("text", { x: W / 2, y: H / 2, class: "note" }, "所选模型暂无「成本 + 智能指数」数据");
      return $("scatter").replaceChildren(svg);
    }
    let xmin = Math.log10(Math.min(...pts.map((p) => p.x))) - 0.25, xmax = Math.log10(Math.max(...pts.map((p) => p.x))) + 0.35;
    if (xmax - xmin < 1) { const c = (xmin + xmax) / 2; xmin = c - 0.5; xmax = c + 0.5; }
    let ymin = Math.min(...pts.map((p) => p.y)), ymax = Math.max(...pts.map((p) => p.y));
    ymin = Math.floor((ymin - 2) / 2) * 2; ymax = Math.ceil((ymax + 2) / 2) * 2;
    const step = ymax - ymin > 20 ? 5 : 2;
    const X = (v) => L + ((Math.log10(v) - xmin) / (xmax - xmin)) * (W - L - R);
    const Y = (v) => H - B - ((v - ymin) / (ymax - ymin)) * (H - T - B);
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) { S("line", { x1: L, x2: W - R, y1: Y(y), y2: Y(y), class: "grid" }); S("text", { x: L - 6, y: Y(y) + 4, "text-anchor": "end" }, y); }
    for (let e = Math.floor(xmin); e <= Math.ceil(xmax); e++) for (const k of [1, 2, 5]) {
      const v = k * 10 ** e;
      if (Math.log10(v) < xmin || Math.log10(v) > xmax) continue;
      S("line", { x1: X(v), x2: X(v), y1: T, y2: H - B, class: "grid" });
      S("text", { x: X(v), y: H - B + 15, "text-anchor": "middle" }, "$" + +v.toPrecision(2));
    }
    S("text", { x: (L + W - R) / 2, y: H - 5, "text-anchor": "middle" }, "单任务成本（对数，越左越省）→");
    S("text", { x: 11, y: (T + H - B) / 2, transform: `rotate(-90 11 ${(T + H - B) / 2})`, "text-anchor": "middle" }, "智能指数（越高越强）→");

    // 前沿阶梯（灰色虚线）
    if (an.front.length > 1) S("polyline", { points: an.front.map((m) => `${X(val(m, COST))},${Y(idxOf(m))}`).join(" "), class: "front-line" });
    // 同系列连线（按成本升序 = 推理强度由低到高）
    const fams = new Map();
    pts.forEach((p) => { if (!fams.has(p.m.fkey)) fams.set(p.m.fkey, []); fams.get(p.m.fkey).push(p); });
    for (const g of fams.values()) {
      if (g.length < 2) continue;
      const sorted = [...g].sort((a, b) => a.x - b.x);
      S("polyline", { points: sorted.map((p) => `${X(p.x)},${Y(p.y)}`).join(" "), fill: "none", stroke: colorFor(sorted[Math.floor(sorted.length / 2)].m.slug), "stroke-width": 2.2, "stroke-opacity": 0.55, "stroke-linejoin": "round" });
    }
    // 点
    pts.forEach((p) => {
      const front = an.frontSet.has(p.m.slug), c = colorFor(p.m.slug);
      const node = front
        ? S("circle", { cx: X(p.x), cy: Y(p.y), r: 6.5, fill: c, stroke: "#fff", "stroke-width": 1.6 })
        : S("circle", { cx: X(p.x), cy: Y(p.y), r: 4.8, fill: "var(--panel)", stroke: c, "stroke-width": 2.2 });
      S("title", {}, `${p.m.name}\n智能 ${p.y} · ${money(p.x)}\n` + (front ? "性价比前沿" : `被 ${shortName(an.dom.get(p.m.slug))} 取代`), node);
    });
    // 标签：前沿优先，空间不够就不标（悬停可看）；多档位系列只标推理强度
    const boxes = [];
    const hit = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const order = [...pts].sort((a, b) => (an.frontSet.has(b.m.slug) - an.frontSet.has(a.m.slug)) || b.y - a.y);
    order.forEach((p) => {
      const cx = X(p.x), cy = Y(p.y), g = fams.get(p.m.fkey);
      const label = g.length > 1 ? shortVar(p.m) || p.m.family : p.m.family.replace(/^Claude /, "");
      const w = label.length * 6.2 + 4;
      const cands = [[10, 4, "start"], [-10, 4, "end"], [0, -11, "middle"], [0, 21, "middle"], [10, -10, "start"], [-10, 17, "end"]];
      for (const cd of cands) {
        const bx = cd[2] === "start" ? cx + cd[0] : cd[2] === "end" ? cx + cd[0] - w : cx - w / 2;
        const b = { x: bx, y: cy + cd[1] - 10, w, h: 13 };
        if (b.x < 0 || b.x + b.w > W || hit(b)) continue;
        boxes.push(b);
        S("text", { x: cx + cd[0], y: cy + cd[1], "text-anchor": cd[2], class: "lbl" }, label);
        break;
      }
    });
    // 图例：系列色
    $("scatter").replaceChildren(svg, el("div", { class: "legend-row" }, ...[...fams.values()].map((g) =>
      el("span", { class: "lg" }, ...[...g].sort((a, b) => b.y - a.y).map((p) => el("i", { style: `background:${colorFor(p.m.slug)}` })), g[0].m.family))));
  }

  /* ---------- 性价比阶梯：多花多少钱，换来多少提升 ---------- */
  function renderLadder(an) {
    const box = $("ladder");
    box.replaceChildren();
    if (an.front.length < 1) return box.append(el("p", { class: "hint pad" }, "暂无可分析的数据"));
    const list = el("ol", { class: "ladder" });
    an.front.forEach((m, i) => {
      if (i > 0) {
        const p = an.front[i - 1];
        const dI = idxOf(m) - idxOf(p), dC = val(m, COST) - val(p, COST);
        list.append(el("li", { class: "step" }, el("span", { class: "arrow" }, "↑"),
          dI > 0 ? `智能 +${dI}，多花 ${money(dC)}（约 ${money(dC / dI)}/分，成本 ×${(val(m, COST) / val(p, COST)).toFixed(1)}）` : "成本增加但无提升"));
      }
      list.append(el("li", { class: "stop" }, el("span", { class: "swatch", style: `background:${colorFor(m.slug)}` }),
        el("span", { class: "nm", title: m.name }, shortName(m)), el("span", { class: "nums" }, `智能 ${idxOf(m)} · ${money(val(m, COST))}`)));
    });
    box.append(list);
  }

  /* ---------- 按场景选：每个场景谁最强 ---------- */
  const SCENARIOS = [
    ["💻 终端 / 编码智能体", "Terminal-Bench 4.0"], ["🔬 科学编程", "SciCode"], ["🧩 综合知识推理", "Humanity's Last Exam"],
    ["📚 长文本理解", "AA-LCR v1.1"], ["📊 金融与会计", "Finance & Accounting"], ["🧭 战略与运营", "Strategy & Ops"],
    ["⚖️ 法律", "Legal"], ["🛠 工程", "Engineering"], ["📈 经济学", "Economics"], ["🩺 医疗健康", "Healthcare & Medical"],
    ["🤖 办公自动化", "AutomationBench-AA"], ["📄 文档理解", "GDP.pdf"],
  ];
  function renderScenarios(ms) {
    const box = $("scenarios");
    box.replaceChildren();
    const rows = [];
    for (const [title, label] of SCENARIOS) {
      const c = ms.filter((m) => val(m, label) != null).sort((a, b) => val(b, label) - val(a, label));
      if (c.length < 1 || (c.length < 2 && ms.length > 1)) continue;
      rows.push({ title, label, c });
    }
    $("scen-panel").hidden = !rows.length;
    if (!rows.length) return;
    const fmt = (m, label) => m.metrics[label];
    const winners = new Set(rows.map((r) => r.c[0].slug));
    $("scen-hint").textContent = winners.size === 1
      ? `${shortName(rows[0].c[0])} 在所有场景都是第一，且无需取舍。`
      : `不同场景的冠军并不相同（共 ${winners.size} 位），按你的主要用途挑选。`;
    const tbl = el("table", { class: "scen" }, el("thead", {}, el("tr", {}, el("th", {}, "场景"), el("th", {}, "🥇 第一"), el("th", {}, "🥈 第二"), el("th", {}, "领先"))));
    const tb = el("tbody");
    rows.forEach(({ title, label, c }) => {
      const gap = c.length > 1 ? val(c[0], label) - val(c[1], label) : null;
      const cell = (m) => m ? el("td", {}, el("span", { class: "swatch", style: `background:${colorFor(m.slug)}` }), el("span", { class: "nm", title: m.name }, shortName(m)), el("b", { class: "sc" }, fmt(m, label))) : el("td", { class: "na" }, "—");
      const w = c[0];
      tb.append(el("tr", {}, el("th", { title: label }, title), cell(c[0]), cell(c[1]), el("td", { class: "gap" }, gap == null ? "—" : gap === 0 ? "持平" : "+" + +gap.toFixed(1))));
    });
    tbl.append(tb);
    box.append(tbl);
  }

  /* ---------- 指标对比：每个指标一张横向柱状图，好 → 差排序 ---------- */
  const TABS = [
    ["core", "核心", [ "Intelligence Index", COST, "Output Speed", "Time to First Token", "End-to-End Response Time", "Time per Task"]],
    ["cap", "场景能力", ["Finance & Accounting", "Strategy & Ops", "Legal", "Healthcare & Medical", "Engineering", "Economics"]],
    ["bench", "评测基准", ["AA-Briefcase v1.1", "GDPval-AA v2.1", "AutomationBench-AA", "Terminal-Bench 4.0", "SciCode", "Humanity's Last Exam", "GDP.pdf", "CritPt", "AA-Omniscience", "AA-LCR v1.1"]],
    ["price", "价格与上下文", ["Input Price", "Output Price", "Cache Hit Price", "Cache Write Price", "Context Window"]],
    ["feat", "特性", null],
  ];
  let activeTab = "core";
  const unitOf = (label) => (DATA.metrics.find((r) => r.label === label) || {}).unit || "";

  function renderCharts(ms, an) {
    const tabs = $("tabs");
    tabs.replaceChildren(...TABS.map(([id, name]) => el("button", { class: "tab" + (id === activeTab ? " on" : ""), onclick: () => { activeTab = id; renderCharts(ms, an); } }, name)));
    const box = $("charts");
    const spec = TABS.find((t) => t[0] === activeTab);
    box.className = "charts" + (activeTab === "feat" ? " feat" : "");
    if (!spec[2]) return box.replaceChildren(featureTable(ms));
    const cards = spec[2].filter((l) => ms.some((m) => val(m, l) != null)).map((l) => barCard(l, ms, an));
    box.replaceChildren(...(cards.length ? cards : [el("p", { class: "hint pad" }, "所选模型在此分类下暂无数据")]));
  }

  function barCard(label, ms, an) {
    const def = M[label] || {}, unit = unitOf(label);
    const items = ms.map((m) => ({ m, v: val(m, label) })).filter((x) => x.v != null)
      .sort((a, b) => (def.dir === "low" ? a.v - b.v : b.v - a.v));
    const lo = Math.min(...items.map((x) => x.v)), hi = Math.max(...items.map((x) => x.v));
    const trunc = items.length >= 2 && lo > 0 && lo / hi > 0.6 && hi !== lo;
    const base = trunc ? Math.max(0, lo - (hi - lo) * 0.6) : 0;
    const bestV = def.dir === "low" ? lo : hi;
    const card = el("div", { class: "bc" },
      el("div", { class: "bc-h" }, el("b", {}, def.zh || label), unit ? el("span", { class: "u" }, unit) : null,
        el("span", { class: "dirt" }, def.dir === "low" ? "越低越好" : def.dir === "high" ? "越高越好" : "")));
    if (def.zh) card.append(el("div", { class: "bc-en" }, label));
    items.forEach(({ m, v }, i) => {
      const best = items.length > 1 && v === bestV && hi !== lo;
      const pct = hi === base ? 100 : Math.max(3, ((v - base) / (hi - base)) * 100);
      const front = an.frontSet.has(m.slug);
      card.append(el("div", { class: "br" + (an.dom.has(m.slug) ? " dim" : "") },
        el("span", { class: "nm", title: m.name }, front && an.pts.length > 1 ? el("em", { title: "性价比前沿" }, "◆") : null, shortName(m)),
        el("span", { class: "tr" }, el("span", { class: "fill", style: `width:${pct}%;background:${colorFor(m.slug)}` })),
        el("span", { class: "vl" + (best ? " best" : "") }, best ? "★ " : "", m.metrics[label])));
    });
    const miss = ms.length - items.length;
    const notes = [trunc ? `轴自 ${+base.toPrecision(3)} 起（已截断，便于看出差距）` : "", miss ? `${miss} 个模型无此数据` : ""].filter(Boolean).join(" · ");
    if (notes) card.append(el("div", { class: "bc-note" }, notes));
    return card;
  }

  function featureTable(ms) {
    const cols = [["Context Window", "上下文"], ["License", "许可"], ["Input Modality", "输入模态"], ["Output Modality", "输出模态"], ["Providers", "API 提供商"]]
      .filter(([l]) => ms.some((m) => m.metrics[l] != null));
    const t = el("table", { class: "feat-t" }, el("thead", {}, el("tr", {}, el("th", {}, "模型"), ...cols.map(([, z]) => el("th", {}, z)))));
    const tb = el("tbody");
    ms.forEach((m) => tb.append(el("tr", {}, el("th", { title: m.name }, el("span", { class: "swatch", style: `background:${colorFor(m.slug)}` }), shortName(m)),
      ...cols.map(([l]) => el("td", {}, (m.metrics[l] ?? "—").replace(/^Supports:\s*/, ""))))));
    t.append(tb);
    return t;
  }

  /* ------------------------------ 导出 / 分享 ------------------------------ */
  function exportCsv() {
    if (!selected.length) return toast("请先选择模型");
    const ms = sortedSelected();
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [["指标", "Metric", "Unit", ...ms.map((m) => m.name)].map(q).join(",")];
    for (const r of metricRows()) {
      const raws = ms.map((m) => m.metrics[r.label] ?? "");
      if (raws.every((x) => x === "")) continue;
      lines.push([(M[r.label] || {}).zh || r.label, r.label, r.unit, ...raws].map(q).join(","));
    }
    const a = el("a", { href: URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" })), download: "ai-arena-compare.csv" });
    document.body.append(a); a.click(); a.remove();
  }
  async function share() {
    persist();
    try { await navigator.clipboard.writeText(location.href); toast("链接已复制（选中的模型已编码在链接里）"); }
    catch { toast("复制失败，请手动复制地址栏链接"); }
  }
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ------------------------------ 数据更新 ------------------------------ */
  function showInfo() {
    const d = new Date(DATA.meta.fetchedAt);
    $("data-info").textContent = `${DATA.meta.modelCount} 个模型 · ${DATA.meta.detailedCount} 个含完整指标 · 数据更新于 ${d.toLocaleString("zh-CN", { hour12: false })}`;
  }
  /** 应用新数据：保留已选模型（消失的自动移除），并标记新增模型 */
  function applyData(d, { announce = false } = {}) {
    const oldSlugs = new Set(MODELS ? MODELS.map((m) => m.slug) : []);
    const prevSel = selected.slice();
    setData(d);
    NEW_SLUGS = oldSlugs.size ? new Set(MODELS.filter((m) => !oldSlugs.has(m.slug)).map((m) => m.slug)) : new Set();
    const removed = prevSel.filter((s) => !BY_SLUG.has(s)).length;
    selected = prevSel.filter((s) => BY_SLUG.has(s));
    assignColors(selected);
    showInfo(); buildCreatorFilter(); buildPresets(); buildList(); renderMain(); persist();
    if (announce) {
      const gone = [...oldSlugs].filter((s) => !BY_SLUG.has(s)).length;
      toast(`更新完成：共 ${MODELS.length} 个模型，新增 ${NEW_SLUGS.size}，下架 ${gone}` + (removed ? `，已从对比中移除 ${removed} 个` : ""));
    }
  }

  let refreshing = false;
  function refresh() {
    if (refreshing) return;
    if (location.protocol === "file:") return toast("在线更新需要启动本地服务：在项目目录执行  node server.mjs");
    refreshing = true;
    const btn = $("btn-refresh"), bar = $("progress");
    btn.disabled = true; btn.textContent = "⏳ 更新中…";
    bar.hidden = false;
    const setP = (p) => { bar.querySelector(".progress-bar").style.width = (p.pct ?? 0) + "%"; bar.querySelector(".progress-msg").textContent = p.msg || ""; };
    setP({ msg: "连接服务 ...", pct: 0 });
    const es = new EventSource("/api/refresh");
    const finish = () => { refreshing = false; es.close(); btn.disabled = false; btn.textContent = "🔄 更新数据"; setTimeout(() => (bar.hidden = true), 600); };
    es.addEventListener("progress", (e) => setP(JSON.parse(e.data)));
    es.addEventListener("done", (e) => { finish(); applyData(JSON.parse(e.data), { announce: true }); });
    es.addEventListener("fail", (e) => { finish(); toast("更新失败：" + JSON.parse(e.data).message + "（已保留旧数据）"); });
    es.onerror = () => { if (refreshing) { finish(); toast("与本地服务断开，请确认 node server.mjs 正在运行"); } };
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    setData(window.AA_DATA);
    showInfo(); buildCreatorFilter(); buildPresets();
    $("search").addEventListener("input", buildList);
    $("creator-filter").addEventListener("change", buildList);
    $("only-detail").addEventListener("change", buildList);
    $("btn-clear").addEventListener("click", () => setSelected([]));
    $("btn-csv").addEventListener("click", exportCsv);
    $("btn-share").addEventListener("click", share);
    $("btn-refresh").addEventListener("click", refresh);
    const drawer = (on) => document.body.classList.toggle("drawer-open", on);
    $("btn-drawer").addEventListener("click", () => drawer(true));
    $("scrim").addEventListener("click", () => drawer(false));

    selected = loadInitial().filter((s) => BY_SLUG.has(s));
    assignColors(selected);
    buildList(); renderMain();

    // 通过本地服务打开时，优先使用服务端最新缓存（服务端会定时后台自动抓取）
    if (location.protocol.startsWith("http")) {
      fetch("/api/data", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d && d.meta && d.meta.fetchedAt > DATA.meta.fetchedAt) applyData(d);
      }).catch(() => {});
    }
  }
  init();
})();
