// ── Chart.js defaults ────────────────────────────────────────────────────────

Chart.defaults.color = "#666";
Chart.defaults.borderColor = "#262626";
Chart.defaults.font.family = "'JetBrains Mono', 'SF Mono', monospace";
Chart.defaults.font.size = 11;

const ACCENT  = "#e8ff57";
const ACCENT2 = "#57c8ff";
const GREEN   = "#57ff8a";
const MUTED   = "#555";

// ── State ─────────────────────────────────────────────────────────────────────

let data = null;
const charts = {};  // keyed by canvas id

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function loadData() {
  const res = await fetch("./data.json");
  data = await res.json();

  const d = new Date(data.generated_at);
  document.getElementById("last-updated").textContent =
    `Updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  renderVolume();
  renderHeatmap();
  renderTraining();
  renderStrengthTab();
  setupProgressiveOverload();
  renderNutrition(30);
  renderCoachSummary();
  renderBodyComp(30);
  renderCutProgress();
  renderTdeeChart(30);
  renderDeficitChart();
  setupTabs();
  setupBodyCompRange();
  setupTdeeRange();
  setupNutRange();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round1(v) { return Math.round(v * 10) / 10; }

function filterLast(arr, days, dateKey = "date") {
  if (!days) return arr;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return arr.filter(r => r[dateKey] >= cutStr);
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function makeLineChart(id, labels, datasets, opts = {}, extraPlugins = []) {
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el) return null;
  const ctx = el.getContext("2d");
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    plugins: extraPlugins,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: {
          ...opts.y,
          ...(opts.yTitle ? { title: { display: true, text: opts.yTitle, color: "#555", font: { family: "'JetBrains Mono',monospace", size: 10 } } } : {}),
        },
      },
      elements: { point: { radius: 2, hoverRadius: 5 } },
    },
  });
  return charts[id];
}

// Plugin: draw text labels at right edge of horizontal reference lines
function annotateLines(entries) {
  return {
    id: "refLineLabels",
    afterDraw(chart) {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const ctx = chart.ctx;
      const xRight = chart.chartArea.right;
      ctx.save();
      ctx.font = `600 9px 'JetBrains Mono', monospace`;
      ctx.textAlign = "right";
      for (const { value, label, color } of entries) {
        const y = yScale.getPixelForValue(value);
        if (y < chart.chartArea.top || y > chart.chartArea.bottom) continue;
        ctx.fillStyle = color + "bb";
        ctx.fillText(label, xRight - 3, y - 3);
      }
      ctx.restore();
    },
  };
}

// Plugin: horizontal zone band backgrounds (used for RIR chart)
function zoneBands(bands) {
  return {
    id: "zoneBands",
    beforeDraw(chart) {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const ctx = chart.ctx;
      const { left, right, top, bottom } = chart.chartArea;
      ctx.save();
      for (const { min, max, color } of bands) {
        const y1 = Math.min(yScale.getPixelForValue(min), bottom);
        const y2 = Math.max(yScale.getPixelForValue(max), top);
        ctx.fillStyle = color;
        ctx.fillRect(left, y2, right - left, y1 - y2);
      }
      ctx.restore();
    },
  };
}

// Animated numeric counter for card values
function animateValue(el, endVal, suffix = "", decimals = 0) {
  if (!el || isNaN(endVal)) return;
  const duration = 600;
  const startTime = performance.now();
  const fn = (now) => {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = (endVal * ease).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(fn);
  };
  requestAnimationFrame(fn);
}

function ffmiRefLine(value, labels, color, label) {
  return {
    label,
    data: labels.map(() => value),
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [5, 4],
    pointRadius: 0,
    tension: 0,
    fill: false,
  };
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function renderCoachSummary() {
  const s = data.summary;
  if (!s) return;

  // ── Weight card ─────────────────────────────────────────────────────────
  const wEl = document.getElementById("bc-weight");
  animateValue(wEl, s.trend_kg, " kg", 1);

  const delta = s.weight_delta_7d != null
    ? `${s.weight_delta_7d >= 0 ? "+" : ""}${s.weight_delta_7d.toFixed(2)} kg/wk`
    : "";
  const deltaEl = document.getElementById("bc-weight-delta");
  if (deltaEl) {
    deltaEl.textContent = delta;
    const d = s.weight_delta_7d;
    // On cut: weight loss (negative delta) = good
    deltaEl.className = "card-sub " + (d == null || Math.abs(d) < 0.05 ? "trend-neutral" : d < 0 ? "trend-good" : "trend-bad");
  }

  // ── Lean mass card ──────────────────────────────────────────────────────
  const leanEl = document.getElementById("bc-lean");
  animateValue(leanEl, s.lean_kg, " kg", 1);

  const leanTrendEl = document.getElementById("bc-lean-trend");
  if (leanTrendEl) {
    leanTrendEl.textContent = `${s.lean_trend} lean mass`;
    leanTrendEl.className = "card-sub " + (s.lean_trend === "↑" ? "trend-good" : s.lean_trend === "↓" ? "trend-bad" : "trend-neutral");
  }

  // ── BF% card ────────────────────────────────────────────────────────────
  const bfEl = document.getElementById("bc-bf");
  if (bfEl) {
    animateValue(bfEl, s.estimated_bf_pct, "%", 1);
    const bf = s.estimated_bf_pct;
    bfEl.className = "card-value " + (bf < 20 ? "trend-good" : bf <= 28 ? "trend-warn" : "trend-bad");
  }
  // Dynamic method label
  const bfMethodEl = document.getElementById("bc-bf-method");
  if (bfMethodEl) {
    const isManual = data.config?.athlete?.bf_pct_manual != null;
    bfMethodEl.textContent = isManual ? "manual estimate" : "YMCA formula";
  }

  // ── FFMI card ───────────────────────────────────────────────────────────
  const ffmiEl = document.getElementById("bc-ffmi");
  if (ffmiEl) {
    animateValue(ffmiEl, s.ffmi, "", 1);
    const f = s.ffmi;
    ffmiEl.className = "card-value " + (f >= 25 ? "trend-good" : f >= 22 ? "trend-neutral" : "");
  }
  const ffmiRef = s.ffmi >= 28 ? "elite" : s.ffmi >= 25 ? "advanced" : s.ffmi >= 22 ? "average" : "below avg";
  setText("bc-ffmi-ref", ffmiRef);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Body comp charts ──────────────────────────────────────────────────────────

function renderBodyComp(days) {
  const bc = filterLast(data.body_comp, days);
  if (!bc.length) return;

  const labels = bc.map(r => r.date.slice(5)); // MM-DD

  // Chart 1: Trend weight + lean mass
  const allVals = bc.flatMap(r => [r.trend_kg, r.lean_kg]).filter(v => v != null);
  const yMin = Math.floor(Math.min(...allVals)) - 2;
  const yMax = Math.ceil(Math.max(...allVals))  + 2;

  makeLineChart("bc-weight-chart", labels, [
    {
      label: "Trend weight (kg)",
      data: bc.map(r => r.trend_kg),
      borderColor: ACCENT,
      backgroundColor: ACCENT + "15",
      fill: false,
      tension: 0.3,
    },
    {
      label: "Lean mass (kg)",
      data: bc.map(r => r.lean_kg),
      borderColor: GREEN,
      backgroundColor: GREEN + "15",
      fill: false,
      tension: 0.3,
    },
  ], { y: { min: yMin, max: yMax }, yTitle: "kg" });

  // Chart 2: FFMI with reference lines
  const ffmiVals = bc.map(r => r.ffmi).filter(v => v != null);
  const ffmiMin = Math.min(Math.floor(Math.min(...ffmiVals)) - 1, 20);
  const ffmiMax = Math.max(Math.ceil(Math.max(...ffmiVals)) + 1, 29);

  makeLineChart("bc-ffmi-chart", labels, [
    {
      label: "FFMI",
      data: bc.map(r => r.ffmi),
      borderColor: ACCENT2,
      backgroundColor: ACCENT2 + "15",
      fill: true,
      tension: 0.3,
    },
    ffmiRefLine(22, labels, "#888",    "22 — avg"),
    ffmiRefLine(25, labels, GREEN,     "25 — advanced"),
    ffmiRefLine(28, labels, ACCENT,    "28 — elite"),
  ], { y: { min: ffmiMin, max: ffmiMax }, yTitle: "FFMI" }, [
    annotateLines([
      { value: 22, label: "avg", color: "#888" },
      { value: 25, label: "adv", color: GREEN  },
      { value: 28, label: "elite", color: ACCENT },
    ]),
  ]);

  // Chart 3: BF% estimates + scale (unreliable)
  const hcBf = data.hc_body_fat;
  const hcByDate = {};
  hcBf.forEach(e => { hcByDate[e.date] = e.pct; });

  const bfAllVals = [
    ...bc.map(r => r.ymca_bf_pct),
    ...bc.map(r => r.deurenberg_bf_pct),
    ...bc.map(r => hcByDate[r.date]).filter(v => v != null),
  ].filter(v => v != null);
  const bfMin = Math.floor(Math.min(...bfAllVals)) - 2;
  const bfMax = Math.ceil(Math.max(...bfAllVals))  + 2;

  makeLineChart("bc-bf-chart", labels, [
    {
      label: "YMCA",
      data: bc.map(r => r.ymca_bf_pct),
      borderColor: ACCENT,
      fill: false,
      tension: 0.3,
    },
    {
      label: "Deurenberg",
      data: bc.map(r => r.deurenberg_bf_pct),
      borderColor: ACCENT2,
      fill: false,
      tension: 0.3,
    },
    {
      label: "Scale (unreliable)",
      data: bc.map(r => hcByDate[r.date] ?? null),
      borderColor: MUTED,
      borderDash: [4, 3],
      fill: false,
      tension: 0,
      spanGaps: false,
      pointRadius: 4,
    },
  ], { y: { min: bfMin, max: bfMax } });
}

function setupBodyCompRange() {
  document.querySelectorAll("[data-bc-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-bc-range]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderBodyComp(parseInt(btn.dataset.bcRange));
    });
  });
}

// ── Cut progress ──────────────────────────────────────────────────────────────

function renderCutProgress() {
  const cut = data.cut;
  if (!cut || !cut.current_trend_kg) return;

  const start = cut.start_weight_kg;
  const current = cut.current_trend_kg;
  const target = cut.target_weight_kg;

  // Fill % = (start - current) / (start - target) * 100, clamped 0–100
  const pct = Math.min(100, Math.max(0, ((start - current) / (start - target)) * 100));

  const fill = document.getElementById("cut-bar-fill");
  if (fill) fill.style.width = pct.toFixed(1) + "%";

  setText("cut-label-start",   `Start ${start} kg`);
  setText("cut-label-current", `Current ${current} kg`);
  setText("cut-label-target",  `Target ~${target} kg`);

  setText("cut-kg-stats", `${cut.kg_lost} kg lost · ${cut.kg_remaining} kg remaining`);

  const rate = cut.rate_kg_per_week;
  const proj = cut.projected_completion_date;
  let projText = "";
  if (proj) {
    projText = `Rate: ${rate} kg/week · Projected: ~${proj} (estimated)`;
  } else {
    projText = rate != null
      ? `Rate: ${rate} kg/week · Rate too slow to estimate`
      : "Rate too slow to estimate";
  }
  setText("cut-projection", projText);
}

// ── TDEE vs Calories chart ─────────────────────────────────────────────────────

function renderTdeeChart(days) {
  const TDEE_COLOR = "#ff9944";
  const rows = filterLast(data.mf_daily, days).filter(
    r => r.tdee != null || r.kcal != null
  );
  if (!rows.length) return;

  const labels = rows.map(r => r.date.slice(5));

  destroyChart("tdee-chart");
  const tdeeEl = document.getElementById("tdee-chart");
  if (!tdeeEl) return;
  const ctx = tdeeEl.getContext("2d");
  charts["tdee-chart"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "TDEE",
          data: rows.map(r => r.tdee ?? null),
          borderColor: TDEE_COLOR,
          backgroundColor: TDEE_COLOR + "15",
          fill: false,
          tension: 0.3,
          spanGaps: false,
          pointRadius: 2,
          hoverRadius: 5,
        },
        {
          label: "Calories",
          data: rows.map(r => r.kcal ?? null),
          borderColor: ACCENT,
          backgroundColor: ACCENT + "15",
          fill: false,
          tension: 0.3,
          spanGaps: false,
          pointRadius: 2,
          hoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const row = rows[ctx.dataIndex];
              const tdee = row.tdee;
              const kcal = row.kcal;
              if (ctx.dataset.label === "TDEE") {
                return ` TDEE: ${tdee != null ? tdee + " kcal" : "—"}`;
              }
              const deficit = (tdee != null && kcal != null) ? Math.round(tdee - kcal) : null;
              return ` Calories: ${kcal != null ? kcal + " kcal" : "—"}${deficit != null ? "  (deficit " + deficit + ")" : ""}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { ticks: { callback: v => v + " kcal" } },
      },
      elements: { point: { radius: 2, hoverRadius: 5 } },
    },
  });
}

function setupTdeeRange() {
  document.querySelectorAll("[data-tdee-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tdee-range]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderTdeeChart(parseInt(btn.dataset.tdeeRange));
    });
  });
}

// ── Daily deficit bar chart ────────────────────────────────────────────────────

function renderDeficitChart() {
  const rows = filterLast(data.mf_daily, 30).filter(
    r => r.tdee != null && r.kcal != null
  );
  if (!rows.length) return;

  const labels = rows.map(r => r.date.slice(5));
  const deficits = rows.map(r => Math.round(r.tdee - r.kcal));

  const colors = deficits.map(d => {
    if (d < 0)    return "#ff5757";   // surplus — red
    if (d <= 500) return "#57ff8a";   // green
    if (d <= 800) return "#ffcc44";   // yellow
    return "#ff5757";                 // >800 — red
  });

  // Update avg deficit badge
  const badge = document.getElementById("avg-deficit-badge");
  if (badge && data.summary.avg_deficit_7d != null) {
    const avg = data.summary.avg_deficit_7d;
    badge.textContent = `7d avg: ${avg} kcal`;
    badge.className = "pill " + (avg >= 500 ? (avg > 800 ? "pill-red" : "pill-yellow") : "pill-green");
  }

  destroyChart("deficit-chart");
  const defEl = document.getElementById("deficit-chart");
  if (!defEl) return;
  const ctx = defEl.getContext("2d");
  charts["deficit-chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Deficit",
          data: deficits,
          backgroundColor: colors,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.parsed.y;
              const zone = d < 0 ? "surplus" : d <= 500 ? "optimal" : d <= 800 ? "aggressive" : "crash";
              return ` Deficit: ${d} kcal (${zone})`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { ticks: { callback: v => v + " kcal" } },
      },
    },
  });
}

// ── Nutrition tab ─────────────────────────────────────────────────────────────

function nutAvg(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function renderNutrition(days) {
  const rows = filterLast(data.mf_daily, days).filter(r => r.protein_g != null || r.kcal != null);
  if (!rows.length) return;
  const labels = rows.map(r => r.date.slice(5));

  // ── Rolling stats: last 7d vs previous 7d ────────────────────────────────
  const all = data.mf_daily;
  const last7  = all.slice(-7);
  const prev7  = all.slice(-14, -7);

  const avgP7    = nutAvg(last7, "protein_g");
  const avgPprev = nutAvg(prev7, "protein_g");
  const avgK7    = nutAvg(last7, "kcal");
  const avgKprev = nutAvg(prev7, "kcal");
  const avgD7    = nutAvg(last7, "deficit");
  const avgDprev = nutAvg(prev7, "deficit");
  const tgtP     = last7.map(r => r.target_protein_g).find(v => v != null);
  const tgtK     = last7.map(r => r.target_kcal).find(v => v != null);
  const leanKg   = data.summary?.lean_kg;

  // Protein card
  if (avgP7 != null) {
    const pAvgEl = document.getElementById("nut-protein-avg");
    animateValue(pAvgEl, Math.round(avgP7), " g");
    const pctOfTarget = tgtP ? Math.round(avgP7 / tgtP * 100) : null;
    const pVsEl = document.getElementById("nut-protein-vs-target");
    if (pVsEl && tgtP) {
      pVsEl.textContent = `${pctOfTarget}% of ${tgtP}g target`;
      pVsEl.className = "card-sub " + (pctOfTarget >= 100 ? "trend-good" : pctOfTarget >= 80 ? "trend-warn" : "trend-bad");
    }
    const perKg = leanKg ? round1(avgP7 / leanKg) : null;
    const pKgEl = document.getElementById("nut-protein-per-kg");
    if (pKgEl && perKg) {
      animateValue(pKgEl, perKg, " g/kg", 1);
      pKgEl.className = "card-value " + (perKg >= 1.8 ? "trend-good" : perKg >= 1.5 ? "trend-warn" : "trend-bad");
    }
    const trendP = avgPprev != null ? Math.round(avgP7 - avgPprev) : null;
    const pTrendEl = document.getElementById("nut-protein-trend");
    if (pTrendEl) {
      pTrendEl.textContent = trendP != null
        ? (trendP >= 0 ? `↑ ${trendP}g vs prev week` : `↓ ${Math.abs(trendP)}g vs prev week`)
        : "lean mass basis";
      pTrendEl.className = "card-sub " + (trendP == null ? "" : trendP >= 0 ? "trend-good" : "trend-bad");
    }
  }

  // Calories card
  if (avgK7 != null) {
    const kAvgEl = document.getElementById("nut-kcal-avg");
    animateValue(kAvgEl, Math.round(avgK7), " kcal");
    const pctK = tgtK ? Math.round(avgK7 / tgtK * 100) : null;
    const kVsEl = document.getElementById("nut-kcal-vs-target");
    if (kVsEl && tgtK) {
      kVsEl.textContent = `${pctK}% of ${tgtK} kcal target`;
      // Calories on cut: close to target = good; too high or too low = warn/bad
      kVsEl.className = "card-sub " + (pctK >= 90 && pctK <= 110 ? "trend-good" : pctK > 115 ? "trend-bad" : "trend-warn");
    }
  }

  // Deficit card
  if (avgD7 != null) {
    const dAvgEl = document.getElementById("nut-deficit-avg");
    animateValue(dAvgEl, Math.round(avgD7), " kcal");
    const d = avgD7;
    if (dAvgEl) {
      dAvgEl.className = "card-value " + (d >= 300 && d <= 700 ? "trend-good" : d < 0 || d > 1000 ? "trend-bad" : "trend-warn");
    }
    const trendD = avgDprev != null ? Math.round(avgD7 - avgDprev) : null;
    const dTrendEl = document.getElementById("nut-deficit-trend");
    if (dTrendEl) {
      dTrendEl.textContent = trendD != null
        ? (trendD > 0 ? `↑ ${trendD} vs prev week` : `↓ ${Math.abs(trendD)} vs prev week`)
        : "vs calories in";
      // On cut: increasing deficit = good (more fat loss pace)
      dTrendEl.className = "card-sub " + (trendD == null ? "" : trendD > 0 ? "trend-good" : "trend-warn");
    }
  }

  // ── Protein chart ─────────────────────────────────────────────────────────
  destroyChart("nut-protein-chart");
  const nutProtEl = document.getElementById("nut-protein-chart");
  if (!nutProtEl) return;
  const ctx1 = nutProtEl.getContext("2d");
  charts["nut-protein-chart"] = new Chart(ctx1, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Protein",
          data: rows.map(r => r.protein_g ?? null),
          backgroundColor: ACCENT2 + "99",
          borderRadius: 2,
          order: 2,
        },
        {
          type: "line",
          label: "Target",
          data: rows.map(r => r.target_protein_g ?? null),
          borderColor: ACCENT,
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} g` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { ticks: { callback: v => v + " g" } },
      },
    },
  });

  // ── Calories chart ────────────────────────────────────────────────────────
  destroyChart("nut-kcal-chart");
  const nutKcalEl = document.getElementById("nut-kcal-chart");
  if (!nutKcalEl) return;
  const ctx2 = nutKcalEl.getContext("2d");
  charts["nut-kcal-chart"] = new Chart(ctx2, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Calories",
          data: rows.map(r => r.kcal ?? null),
          backgroundColor: ACCENT + "99",
          borderRadius: 2,
          order: 2,
        },
        {
          type: "line",
          label: "Target",
          data: rows.map(r => r.target_kcal ?? null),
          borderColor: "#ff9944",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} kcal` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { ticks: { callback: v => v + " kcal" } },
      },
    },
  });
}

function setupNutRange() {
  document.querySelectorAll("[data-nut-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-nut-range]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderNutrition(parseInt(btn.dataset.nutRange));
    });
  });
}

// ── Strength Standards (strengthlevel.com, male, kg) ─────────────────────────
// BW brackets: 60,70,80,90,100,110,120. Each tier: beginner,novice,intermediate,advanced,elite.

const SL_DATA = {
  "bench-press": {
    60:  [34, 51, 72,  96,  123],
    70:  [44, 62, 85,  112, 141],
    80:  [53, 74, 98,  127, 157],
    90:  [62, 84, 111, 141, 172],
    100: [71, 94, 122, 153, 187],
    110: [80, 104,133, 166, 200],
    120: [88, 113,143, 177, 213],
  },
  "incline-bench-press": {
    60:  [32, 46, 63,  83,  106],
    70:  [41, 57, 76,  98,  122],
    80:  [50, 67, 88,  112, 138],
    90:  [59, 78, 100, 125, 152],
    100: [67, 87, 111, 137, 165],
    110: [75, 96, 121, 149, 178],
    120: [83, 105,131, 160, 190],
  },
  "deadlift": {
    60:  [58, 83,  114, 149, 187],
    70:  [73, 100, 133, 171, 212],
    80:  [86, 116, 151, 192, 235],
    90:  [99, 131, 168, 211, 256],
    100: [111,145, 184, 228, 275],
    110: [123,158, 199, 245, 293],
    120: [134,171, 213, 261, 311],
  },
  "lat-pulldown": {
    60:  [31, 47, 67,  92,  118],
    70:  [37, 54, 76,  101, 129],
    80:  [42, 61, 84,  110, 139],
    90:  [47, 67, 91,  119, 149],
    100: [52, 72, 97,  126, 157],
    110: [57, 78, 104, 133, 165],
    120: [61, 83, 110, 140, 172],
  },
  "shoulder-press": {
    60:  [21, 32, 47, 64,  84],
    70:  [27, 40, 56, 75,  95],
    80:  [33, 47, 64, 84,  106],
    90:  [39, 54, 72, 93,  116],
    100: [44, 60, 79, 102, 125],
    110: [49, 66, 86, 109, 134],
    120: [54, 72, 93, 117, 142],
  },
  // Pull-ups / dips: values = added weight (negative = assistance needed)
  "pull-ups": {
    60:  [-8,  9,  29, 51, 74],
    70:  [-7,  11, 32, 56, 81],
    80:  [-7,  12, 35, 60, 86],
    90:  [-8,  13, 36, 62, 90],
    100: [-9,  13, 37, 64, 93],
    110: [-10, 12, 38, 66, 95],
    120: [-12, 11, 37, 66, 96],
  },
  "dips": {
    60:  [-5, 15, 39, 67,  96],
    70:  [-2, 20, 46, 76,  107],
    80:  [0,  23, 51, 83,  116],
    90:  [1,  26, 56, 89,  124],
    100: [2,  29, 60, 94,  130],
    110: [2,  30, 63, 98,  136],
    120: [2,  31, 65, 102, 140],
  },
  "t-bar-row": {
    60:  [25, 42, 65, 93,  124],
    70:  [33, 52, 77, 108, 141],
    80:  [40, 62, 89, 121, 156],
    90:  [48, 71, 100,134, 171],
    100: [55, 79, 110,145, 184],
    110: [62, 88, 120,156, 196],
    120: [68, 95, 129,167, 208],
  },
  "cable-lateral-raise": {
    60:  [0, 4,  14, 29, 48],
    70:  [1, 6,  16, 33, 53],
    80:  [1, 7,  19, 36, 58],
    90:  [2, 9,  21, 40, 62],
    100: [3, 10, 24, 43, 66],
    110: [3, 12, 26, 46, 70],
    120: [4, 13, 28, 48, 73],
  },
  "seated-leg-curl": {
    60:  [22, 40, 65, 95,  130],
    70:  [28, 47, 74, 106, 142],
    80:  [32, 54, 81, 115, 152],
    90:  [37, 60, 89, 124, 162],
    100: [42, 65, 95, 132, 171],
    110: [46, 70, 102,139, 180],
    120: [50, 75, 108,146, 188],
  },
  "preacher-curl": {
    60:  [12, 22, 36, 53, 72],
    70:  [15, 26, 41, 59, 80],
    80:  [18, 30, 46, 65, 87],
    90:  [21, 34, 51, 71, 93],
    100: [24, 38, 55, 76, 99],
    110: [27, 41, 59, 81, 105],
    120: [30, 44, 63, 85, 110],
  },
  "leg-extension": {
    60:  [27, 49, 79, 116, 158],
    70:  [34, 58, 90, 129, 172],
    80:  [40, 65, 99, 140, 186],
    90:  [45, 73, 108,150, 198],
    100: [51, 79, 116,160, 209],
    110: [56, 86, 124,169, 219],
    120: [61, 92, 131,178, 228],
  },
  "horizontal-leg-press": {
    60:  [52,  93,  149, 218, 297],
    70:  [67,  113, 174, 248, 331],
    80:  [82,  132, 197, 276, 363],
    90:  [96,  149, 219, 301, 392],
    100: [109, 166, 239, 325, 419],
    110: [122, 182, 258, 347, 444],
    120: [135, 198, 276, 368, 468],
  },
  "tricep-pushdown": {
    60:  [12, 24, 43, 67,  95],
    70:  [16, 30, 51, 77,  106],
    80:  [20, 36, 58, 85,  116],
    90:  [24, 41, 65, 93,  126],
    100: [28, 46, 71, 101, 134],
    110: [32, 51, 77, 108, 143],
    120: [35, 56, 83, 115, 150],
  },
};

const SL_TIERS = ["beginner", "novice", "intermediate", "advanced", "elite"];
const SL_BW_BRACKETS = [60, 70, 80, 90, 100, 110, 120];

// Exercise name → standards key mapping (substring match)
const STANDARDS_MAP = [
  ["Barbell Bench Press",          "bench-press"],
  ["Low Incline Barbell Press",    "incline-bench-press"],
  ["Barbell Romanian Deadlift",    "deadlift"],
  ["Cable Lat Pulldown",           "lat-pulldown"],
  ["Assisted Pull-Up",             "pull-ups"],
  ["Assisted Dip",                 "dips"],
  ["Machine Triceps Dip",          "dips"],
  ["Machine Shoulder Press",       "shoulder-press"],
  ["Machine Press",                "shoulder-press"],
  ["T-Bar Row",                    "t-bar-row"],
  ["Cable Lateral Raise",          "cable-lateral-raise"],
  ["Hamstring Curl",               "seated-leg-curl"],
  ["Preacher Curl",                "preacher-curl"],
  ["Leg Extension",                "leg-extension"],
  ["Leg Press",                    "horizontal-leg-press"],
  ["Cable Straight Bar Triceps Pushdown", "tricep-pushdown"],
];

function getStandardsKey(exerciseName) {
  for (const [pattern, key] of STANDARDS_MAP) {
    if (exerciseName.includes(pattern)) return key;
  }
  return null;
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Returns {beginner, novice, intermediate, advanced, elite} interpolated at bwKg
function getStandardsForBW(key, bwKg) {
  const table = SL_DATA[key];
  if (!table) return null;
  const brackets = SL_BW_BRACKETS;
  const bwClamped = Math.max(brackets[0], Math.min(brackets[brackets.length - 1], bwKg));
  const upper = brackets.find(b => b >= bwClamped) ?? brackets[brackets.length - 1];
  const lower = brackets.slice().reverse().find(b => b <= bwClamped) ?? brackets[0];
  const t = upper === lower ? 0 : (bwClamped - lower) / (upper - lower);
  return Object.fromEntries(
    SL_TIERS.map((tier, i) => [tier, lerp(table[lower][i], table[upper][i], t)])
  );
}

// Classify a value against thresholds → {tier, nextTier, pct, deltaToNext}
function classifyLift(value, thresholds) {
  const tiers = SL_TIERS;
  let tier = "below";
  let nextTier = "beginner";
  let pct = 0;
  let deltaToNext = thresholds.beginner - value;

  for (let i = 0; i < tiers.length; i++) {
    const lo = i === 0 ? -Infinity : thresholds[tiers[i - 1]];
    const hi = thresholds[tiers[i]];
    if (value < hi) {
      tier = i === 0 ? "below" : tiers[i - 1];
      nextTier = tiers[i];
      deltaToNext = Math.ceil(hi - value);
      const bandStart = i === 0 ? Math.min(lo, value) : lo;
      pct = bandStart === -Infinity ? 0 : Math.min((value - bandStart) / (hi - bandStart) * 100, 100);
      return { tier, nextTier, deltaToNext, pct };
    }
  }
  // Above elite
  return { tier: "elite", nextTier: null, deltaToNext: 0, pct: 100 };
}

// ── Percentile + Projection helpers for Strength Standards ───────────────────

const TIER_PERCENTILES = { below: 0, beginner: 5, novice: 20, intermediate: 50, advanced: 80, elite: 95 };
const TIER_DECEL = { below: 1.0, beginner: 0.85, novice: 0.70, intermediate: 0.55, advanced: 0.40, elite: 0.25 };

function liftPercentile(value, thresholds) {
  const tiers = SL_TIERS;
  if (value < thresholds.beginner) {
    return Math.max(0, (value / thresholds.beginner) * 5);
  }
  for (let i = 0; i < tiers.length - 1; i++) {
    const lo = thresholds[tiers[i]];
    const hi = thresholds[tiers[i + 1]];
    if (value < hi) {
      const t = (value - lo) / (hi - lo);
      return lerp(TIER_PERCENTILES[tiers[i]], TIER_PERCENTILES[tiers[i + 1]], t);
    }
  }
  return Math.min(99, 95 + (value - thresholds.elite) / thresholds.elite * 20);
}

function projectProgress(ex, currentValue, currentTier, isPullDip, bwKg) {
  const history = _exMap?.[ex];
  if (!history || history.length < 3) return null;

  const vals = history.map(h => {
    if (isPullDip) {
      const bw = getBW(h.date) || bwKg;
      return h.e1rm - bw;
    }
    return h.e1rm;
  });

  const dates = history.map(h => h.date);
  const t0 = new Date(dates[0]).getTime();
  const daySpan = (new Date(dates[dates.length - 1]).getTime() - t0) / 86400000;
  if (daySpan < 7) return null;

  const n = vals.length;
  const lambda = Math.LN2 / 30;
  let wSum = 0, wxSum = 0, wySum = 0, wxySum = 0, wxxSum = 0;
  for (let i = 0; i < n; i++) {
    const dayI = (new Date(dates[i]).getTime() - t0) / 86400000;
    const w = Math.exp(lambda * (dayI - daySpan));
    wSum += w; wxSum += w * dayI; wySum += w * vals[i];
    wxySum += w * dayI * vals[i]; wxxSum += w * dayI * dayI;
  }
  const denom = wSum * wxxSum - wxSum * wxSum;
  if (Math.abs(denom) < 1e-10) return null;
  const dailySlope = (wSum * wxySum - wxSum * wySum) / denom;

  if (dailySlope <= 0) return null;

  const decel = TIER_DECEL[currentTier] || 0.5;
  const projected30d = currentValue + dailySlope * 30 * decel;

  return { projected30d: round1(projected30d), dailySlope, decel };
}

function renderStrengthStandards(allTimePR, bwKg) {
  const box = document.getElementById("strength-standards-box");
  const list = document.getElementById("strength-standards-list");
  if (!list || !bwKg) return;

  const rows = [];

  for (const [ex, pr] of Object.entries(allTimePR)) {
    const key = getStandardsKey(ex);
    if (!key) continue;

    // Skip eGym exercises — machine resistance scale ≠ real loading
    if (classifyEquipment(ex) === "egym") continue;

    const thresholds = getStandardsForBW(key, bwKg);
    if (!thresholds) continue;

    const isPullDip = key === "pull-ups" || key === "dips";
    const cred = _exCred[ex];
    let compValue;

    if (isPullDip) {
      const credE1rm = cred ? cred.credibleE1rm : pr.e1rm;
      const bwAtPR = getBW(pr.date) || bwKg;
      compValue = round1(credE1rm - bwAtPR);
    } else {
      compValue = cred ? cred.credibleE1rm : pr.e1rm;
    }

    const cls = classifyLift(compValue, thresholds);
    rows.push({ ex, key, pr, compValue, thresholds, cls, isPullDip });
  }

  if (!rows.length) {
    if (box) box.style.display = "none";
    return;
  }

  // Sort: bench first, then by e1rm desc
  const ORDER = [
    "bench-press", "incline-bench-press", "deadlift",
    "horizontal-leg-press", "leg-extension", "seated-leg-curl",
    "lat-pulldown", "t-bar-row", "pull-ups",
    "shoulder-press", "dips",
    "cable-lateral-raise", "preacher-curl", "tricep-pushdown",
  ];
  rows.sort((a, b) => {
    const ai = ORDER.indexOf(a.key), bi = ORDER.indexOf(b.key);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return b.compValue - a.compValue;
  });

  // Deduplicate by key (keep best)
  const seen = new Set();
  const unique = rows.filter(r => { if (seen.has(r.key)) return false; seen.add(r.key); return true; });

  const badgeClass = tier => ({
    below: "std-badge-below", beginner: "std-badge-beginner",
    novice: "std-badge-novice", intermediate: "std-badge-intermediate",
    advanced: "std-badge-advanced", elite: "std-badge-elite",
  })[tier] || "std-badge-below";

  const badgeLabel = tier => tier === "below" ? "developing" : tier.charAt(0).toUpperCase() + tier.slice(1);

  const tierColor = tier => ({
    below: "var(--muted2)", beginner: "var(--zone-below)",
    novice: "var(--zone-ok)", intermediate: "var(--zone-high)",
    advanced: "var(--accent)", elite: "var(--accent2)",
  })[tier] || "var(--muted2)";

  // Compute bar fill: % from beginner to elite
  function barPct(value, thresholds) {
    const lo = thresholds.beginner;
    const hi = thresholds.elite;
    if (hi <= lo) return 0;
    return Math.max(0, Math.min(100, (value - lo) / (hi - lo) * 100));
  }

  function tierPct(tierName, thresholds) {
    const lo = thresholds.beginner;
    const hi = thresholds.elite;
    if (hi <= lo) return 0;
    return Math.max(0, Math.min(100, (thresholds[tierName] - lo) / (hi - lo) * 100));
  }

  list.innerHTML = unique.map(({ ex, key, pr, compValue, thresholds, cls, isPullDip }) => {
    const cred = _exCred[ex];
    const shortName = ex
      .replace(/Neutral Grip Pin-Loaded Machine /g, "")
      .replace(/Pin-Loaded Machine /g, "")
      .replace(/Overhand Grip Pin-Loaded Machine /g, "")
      .replace(/Egym Machine /g, "")
      .replace(/Barbell /g, "");
    const note = key === "deadlift" ? "vs conventional DL"
      : isPullDip ? "e1RM equiv."
      : "";
    const ciStr = cred ? ` ±${cred.ci}` : "";
    const valStr = isPullDip
      ? (compValue >= 0 ? `+${round1(compValue)}${ciStr} kg e1RM added` : `${round1(compValue)}${ciStr} kg e1RM (assist)`)
      : `${round1(compValue)}${ciStr} kg e1RM`;
    const fillPct = barPct(compValue, thresholds);
    const color = tierColor(cls.tier);

    // Percentile
    const pctRaw = liftPercentile(compValue, thresholds);
    const pctRounded = Math.round(pctRaw);
    const topPct = 100 - pctRounded;
    const pctStr = `<span class="std-pct">Top ${topPct}%</span>`;

    // Progress projection (30-day)
    const proj = projectProgress(ex, compValue, cls.tier, isPullDip, bwKg);
    let ghostMarker = "";
    let etaStr = "";

    if (proj) {
      const projPct = barPct(proj.projected30d, thresholds);
      if (projPct > fillPct) {
        ghostMarker = `<div class="std-bar-ghost" style="left:${Math.min(100, projPct).toFixed(1)}%"></div>`;
      }
      // Time estimate to next tier
      if (cls.nextTier) {
        const dailyGain = proj.dailySlope * proj.decel;
        if (dailyGain > 0) {
          const daysToNext = cls.deltaToNext / dailyGain;
          const weeksToNext = Math.round(daysToNext / 7);
          if (weeksToNext <= 52) {
            etaStr = `<span class="std-eta">(~${weeksToNext} wk)</span>`;
          }
        }
      }
    }

    const deltaStr = cls.nextTier
      ? `+${cls.deltaToNext} kg → ${cls.nextTier} ${etaStr}`
      : "Elite ✓";

    // Tick marks for each tier boundary
    const ticks = SL_TIERS.map(t => {
      const p = tierPct(t, thresholds);
      return `<div class="std-bar-tick" style="left:${p}%"></div>`;
    }).join("");

    return `<div class="std-row">
      <div class="std-name">${shortName}${note ? `<small>${note}</small>` : ""}</div>
      <div class="std-badge ${badgeClass(cls.tier)}">${badgeLabel(cls.tier)}</div>
      <div class="std-bar-wrap">
        <div class="std-bar-track">
          <div class="std-bar-fill" style="width:${fillPct.toFixed(1)}%;background:${color}"></div>
          ${ticks}
          <div class="std-bar-marker" style="left:${Math.max(0, Math.min(100, fillPct)).toFixed(1)}%"></div>
          ${ghostMarker}
        </div>
        <div class="std-delta"><strong>${valStr}</strong> · ${pctStr} · ${deltaStr}</div>
      </div>
    </div>`;
  }).join("") + `<div class="std-attribution">Standards: <a href="https://strengthlevel.com" target="_blank" style="color:inherit">strengthlevel.com</a> · male · BW ${round1(bwKg)} kg · 1RM kg</div>`;
}

// ── Progressive overload ──────────────────────────────────────────────────────

let _exMap = null;  // exercise → [{date, weight_kg, effective_kg, reps, e1rm, rir, isAssisted}]
let _exOrder = [];  // sorted by session count desc
let _relativeMode = false;  // ÷BW toggle state
let _allTimePR = {};  // exercise → best PR entry (hoisted for use in both tabs)

// Exponentially-weighted linear regression for trend detection.
// Half-life = 4 sessions → recent data weighted ~2× more than 4 sessions ago.
// Returns slope t-statistic; |t| > 1.5 ≈ 87% confidence in direction.
function bayesianTrend(vals) {
  const n = vals.length;
  if (n < 3) return { label: "", cls: "", trendLine: null };
  const lambda = Math.log(2) / 4;
  const ws = vals.map((_, i) => Math.exp(lambda * i));
  const W  = ws.reduce((s, w) => s + w, 0);
  const mx = ws.reduce((s, w, i) => s + w * i,        0) / W;
  const my = ws.reduce((s, w, i) => s + w * vals[i],  0) / W;
  const Sxx = ws.reduce((s, w, i) => s + w * (i - mx) ** 2, 0);
  const Sxy = ws.reduce((s, w, i) => s + w * (i - mx) * (vals[i] - my), 0);
  const slope = Sxy / Sxx;
  const rss = ws.reduce((s, w, i) => {
    const r = vals[i] - (my + slope * (i - mx));
    return s + w * r * r;
  }, 0);
  const sigma2 = rss / Math.max(n - 2, 1);
  const tStat  = slope / Math.sqrt(sigma2 / Sxx);
  let label = "stalled", cls = "pill-yellow";
  if (tStat >  1.5) { label = "progressing ↑"; cls = "pill-green"; }
  if (tStat < -1.5) { label = "regressing ↓";  cls = "pill-red";   }
  // Trend line endpoints for chart overlay
  const y0 = my + slope * (0     - mx);
  const y1 = my + slope * (n - 1 - mx);
  return { label, cls, trendLine: [y0, y1] };
}

// Module-level BW lookup (populated by buildExMap, used by renderProgressiveOverload)
let _bwByDate = {};
let _latestBW = null;

function getBW(date) {
  if (_bwByDate[date]) return _bwByDate[date];
  const prior = Object.keys(_bwByDate).filter(d => d <= date).sort();
  return prior.length ? _bwByDate[prior[prior.length - 1]] : _latestBW;
}

function buildExMap() {
  if (_exMap) return;
  _exMap = {};
  const counts = {};

  // Build date → bodyweight lookup from body_comp (for assisted e1RM)
  if (data.body_comp) {
    for (const bc of data.body_comp) _bwByDate[bc.date] = bc.trend_kg;
    const dates = Object.keys(_bwByDate).sort();
    if (dates.length) _latestBW = _bwByDate[dates[dates.length - 1]];
  }

  for (const w of data.workouts) {
    const bw = getBW(w.date);
    const best = {};
    for (const s of w.sets) {
      if (!s.weight_kg || !s.reps || s.set_type === "Drop") continue;
      const ex = s.exercise;
      const isAssisted = s.weight_kg < 0;
      // For assisted: effective load = bodyweight − assistance; use latest BW if none found
      const effectiveW = isAssisted
        ? ((bw ?? _latestBW ?? 80) - Math.abs(s.weight_kg))
        : s.weight_kg;
      const e1rm = effectiveW * (1 + s.reps / 30);
      if (!best[ex] || e1rm > best[ex].e1rm) {
        best[ex] = { date: w.date, weight_kg: s.weight_kg, effective_kg: round1(effectiveW), reps: s.reps, e1rm, rir: s.rir, isAssisted };
      }
    }
    for (const [ex, entry] of Object.entries(best)) {
      if (!_exMap[ex]) _exMap[ex] = [];
      _exMap[ex].push(entry);
      counts[ex] = _exMap[ex].length;
    }
  }
  _exOrder = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([ex]) => ex);
  computeCredibility();
}

// ── Credibility engine ────────────────────────────────────────────────────────

function classifyEquipment(ex) {
  if (/\begym\b/i.test(ex)) return "egym";
  if (/\bbarbell\b|\bdumbbell\b|\bez bar\b|\bplate.weighted\b/i.test(ex)) return "free";
  if (/\bcable\b/i.test(ex)) return "cable";
  if (/\bpin.loaded\b|\bplate.loaded\b/i.test(ex)) return "machine";
  if (/\bmachine\b/i.test(ex)) return "machine";
  return "other";
}

const EQUIP_TRUST = { free: 1.0, cable: 0.92, machine: 0.82, egym: 0.55, other: 0.78 };

// MAD-based outlier detection (robust to outliers themselves)
function flagOutliers(values) {
  const n = values.length;
  if (n < 4) return values.map(() => false);
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(n / 2)];
  const absDevs = values.map(v => Math.abs(v - med));
  const mad = [...absDevs].sort((a, b) => a - b)[Math.floor(n / 2)];
  const sigma = 1.4826 * mad; // MAD → σ equivalence under normal
  if (sigma < 2) return values.map(() => false);
  return values.map(v => Math.abs(v - med) > 2.5 * sigma);
}

let _exCred = {};

function computeCredibility() {
  _exCred = {};
  const today = new Date();

  for (const [ex, history] of Object.entries(_exMap)) {
    const n = history.length;
    const e1rms = history.map(e => e.e1rm);
    const dates = history.map(e => e.date);

    // 1. Outlier detection
    const outliers = flagOutliers(e1rms);

    // 2. Clean values (non-outlier)
    const cleanE1rms = [], cleanDates = [];
    for (let i = 0; i < n; i++) {
      if (!outliers[i]) { cleanE1rms.push(e1rms[i]); cleanDates.push(dates[i]); }
    }

    // 3. Recency-weighted mean (half-life 30 days)
    const hl = Math.LN2 / 30;
    let wSum = 0, wTotal = 0;
    for (let i = 0; i < cleanE1rms.length; i++) {
      const age = (today - new Date(cleanDates[i])) / 86400000;
      const w = Math.exp(-hl * age);
      wSum += w * cleanE1rms[i]; wTotal += w;
    }
    const weightedMean = wTotal > 0 ? wSum / wTotal : e1rms[e1rms.length - 1];

    // 4. Robust peak: P90 of clean values
    const sc = [...cleanE1rms].sort((a, b) => a - b);
    const robustPeak = sc.length >= 2 ? sc[Math.min(Math.floor(sc.length * 0.9), sc.length - 1)] : (sc[0] || Math.max(...e1rms));

    // 5. Component factors
    const equipType = classifyEquipment(ex);
    const equipFactor = EQUIP_TRUST[equipType];
    const sessionFactor = 1 - Math.exp(-n / 5);
    const daysSinceLast = (today - new Date(dates[dates.length - 1])) / 86400000;
    const recencyFactor = Math.exp(-daysSinceLast / 45);

    // Consistency (CV of clean values)
    let cv = 0;
    if (cleanE1rms.length >= 3) {
      const mean = cleanE1rms.reduce((a, b) => a + b, 0) / cleanE1rms.length;
      const std = Math.sqrt(cleanE1rms.reduce((s, v) => s + (v - mean) ** 2, 0) / cleanE1rms.length);
      cv = mean > 0 ? std / mean : 0;
    }
    const consistencyFactor = 1 / (1 + cv * 4);

    // 6. Composite confidence (0–1)
    const confidence = Math.min(1, sessionFactor * recencyFactor * equipFactor * consistencyFactor);

    // 7. Bayesian estimate: blend robust peak ← weighted mean by confidence
    //    High confidence → trust peak, low → shrink toward weighted mean
    const credibleE1rm = round1(confidence * robustPeak + (1 - confidence) * weightedMean);

    // 8. Confidence interval (±) from clean data std, penalized by equipment + sample size
    const cleanStd = cleanE1rms.length >= 2
      ? Math.sqrt(cleanE1rms.reduce((s, v) => s + (v - weightedMean) ** 2, 0) / cleanE1rms.length)
      : robustPeak * 0.1;
    const ci = round1((cleanStd / Math.sqrt(Math.max(cleanE1rms.length, 1))) / equipFactor * 1.96);

    _exCred[ex] = {
      confidence: round1(confidence * 100) / 100,
      credibleE1rm, ci,
      rawBest: round1(Math.max(...e1rms)),
      weightedMean: round1(weightedMean),
      equipType, equipFactor,
      outliers,
      outlierCount: outliers.filter(Boolean).length,
    };
  }
}

// ── Progressive Overload chart ────────────────────────────────────────────────

function renderProgressiveOverload(exercise) {
  const history = _exMap[exercise];
  if (!history || history.length < 2) return;

  const isAssisted = history.some(e => e.isAssisted);
  const labels = history.map(e => e.date.slice(5));
  const bwNow = data.summary?.trend_kg;

  // In relative mode: divide each e1RM by the BW on that date
  const e1rms = _relativeMode
    ? history.map(e => round1(e.e1rm / (getBW(e.date) || bwNow || 80)))
    : history.map(e => round1(e.e1rm));

  // Bayesian trend over all sessions (exponentially weighted regression)
  const trend = bayesianTrend(e1rms);

  const badge = document.getElementById("po-trend-badge");
  if (badge) {
    badge.textContent = trend.label;
    badge.className = "pill " + trend.cls;
    badge.style.display = trend.label ? "" : "none";
  }

  // Outlier flags from credibility engine
  const cred = _exCred[exercise];
  const outlierFlags = cred ? cred.outliers : history.map(() => false);

  // PR flags: each point that sets a new all-time high e1RM
  let allTimeBest = -Infinity;
  const prFlags = e1rms.map(v => {
    if (v > allTimeBest) { allTimeBest = v; return true; }
    return false;
  });

  // Trend line: two-point line from Bayesian regression
  const trendData = trend.trendLine
    ? labels.map((_, i) => {
        const frac = i / (labels.length - 1);
        return round1(trend.trendLine[0] + frac * (trend.trendLine[1] - trend.trendLine[0]));
      })
    : null;

  destroyChart("po-chart");
  const poEl = document.getElementById("po-chart");
  if (!poEl) return;
  const ctx = poEl.getContext("2d");
  const datasets = [
    {
      label: "e1RM",
      data: e1rms,
      borderColor: ACCENT,
      backgroundColor: ACCENT + "12",
      fill: true,
      tension: 0.3,
      pointRadius: history.map((_, i) => outlierFlags[i] ? 5 : prFlags[i] ? 5 : 2),
      pointBackgroundColor: history.map((_, i) => outlierFlags[i] ? "#ff5757" : prFlags[i] ? ACCENT : ACCENT + "80"),
      pointBorderColor: history.map((_, i) => outlierFlags[i] ? "#ff575780" : prFlags[i] ? "#000" : "transparent"),
      pointBorderWidth: history.map((_, i) => outlierFlags[i] ? 2 : prFlags[i] ? 1.5 : 0),
      order: 1,
    },
  ];
  if (trendData) {
    datasets.push({
      label: "Trend",
      data: trendData,
      borderColor: "#888",
      backgroundColor: "transparent",
      fill: false,
      tension: 0,
      borderDash: [5, 4],
      pointRadius: 0,
      order: 2,
    });
  }

  // In relative mode: add tier reference lines if standards exist for this exercise
  const stdKey  = getStandardsKey(exercise);
  const stdExtraPlugins = [];
  if (_relativeMode && stdKey && bwNow) {
    const thresholds = getStandardsForBW(stdKey, bwNow);
    if (thresholds) {
      const tierLineColor = { beginner: "var(--zone-below)", novice: "var(--zone-ok)", intermediate: "var(--zone-high)", advanced: "var(--accent)", elite: "var(--accent2)" };
      stdExtraPlugins.push(annotateLines(
        SL_TIERS.map(t => ({ value: round1(thresholds[t] / bwNow), label: t, color: tierLineColor[t] }))
      ));
      // Add tier lines as dashed datasets
      SL_TIERS.forEach(t => {
        const relVal = round1(thresholds[t] / bwNow);
        datasets.push({
          label: t,
          data: labels.map(() => relVal),
          borderColor: tierLineColor[t],
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          tension: 0,
          fill: false,
          order: 3,
        });
      });
    }
  }

  charts["po-chart"] = new Chart(ctx, {
    type: "line",
    plugins: stdExtraPlugins,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 300, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const i = ctx.dataIndex;
              const entry = history[i];
              if (SL_TIERS.includes(ctx.dataset.label)) return null;
              if (ctx.dataset.label === "Trend") return ` Trend: ${ctx.parsed.y}${_relativeMode ? "×BW" : " kg"}`;
              const pr = prFlags[i] ? " ★PR" : "";
              const outlier = outlierFlags[i] ? " ⚠ suspect" : "";
              const setDetail = isAssisted
                ? `${Math.abs(entry.weight_kg)} kg assist × ${entry.reps}${entry.rir != null ? " @" + entry.rir : ""}`
                : `${entry.weight_kg} kg × ${entry.reps}${entry.rir != null ? " @" + entry.rir : ""}`;
              const val = ctx.parsed.y;
              const label = _relativeMode ? ` Relative: ${val}×BW${pr}${outlier}` : ` e1RM: ${val} kg${pr}${outlier}`;
              return [label, ` ${setDetail}`];
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { ticks: { callback: v => _relativeMode ? v + "×" : v + " kg" } },
      },
    },
  });

  // Stats row
  const last = history[history.length - 1];
  const statsEl = document.getElementById("po-stats");
  if (statsEl) {
    const latestLine = isAssisted
      ? `Latest: <span>${Math.abs(last.weight_kg)} kg assist × ${last.reps}</span>`
      : `Latest: <span>${last.weight_kg} kg × ${last.reps}</span>`;

    // Credibility-aware stats
    const credLine = cred
      ? `Est. e1RM: <span data-tip="Bayesian estimate (±95% CI). Weighted by recency, consistency, equipment trust. Outliers excluded.">${cred.credibleE1rm} ±${cred.ci} kg</span>`
      : `Peak e1RM: <span>${round1(Math.max(...e1rms))} kg</span>`;
    const confPct = cred ? Math.round(cred.confidence * 100) : null;
    const confCls = confPct >= 60 ? "trend-good" : confPct >= 35 ? "trend-warn" : "trend-bad";
    const confLine = confPct !== null
      ? `Confidence: <span class="${confCls}" data-tip="Composite of ${history.length} sessions × ${cred.equipType} equipment × recency × consistency">${confPct}%</span>` : "";
    const outlierLine = cred && cred.outlierCount
      ? `<span class="po-stat" style="color:var(--red);font-size:0.68rem" data-tip="MAD-based detection: values >2.5σ from median flagged as suspect">${cred.outlierCount} suspect point${cred.outlierCount > 1 ? "s" : ""} excluded from estimate</span>` : "";

    statsEl.innerHTML = `
      <span class="po-stat">Sessions: <span>${history.length}</span></span>
      <span class="po-stat">${credLine}</span>
      <span class="po-stat">${confLine}</span>
      <span class="po-stat">${latestLine}</span>
      ${outlierLine}`;
  }
}

function shortName(ex) {
  return ex
    .replace(/^Low Incline Barbell\s+/i, "Incline ")
    .replace(/^Low Incline\s+/i, "Incline ")
    .replace(/^Neutral Grip\s+/i, "")
    .replace(/^Pin-Loaded Machine\s+/i, "")
    .replace(/^Egym Machine\s+/i, "")
    .replace(/^Overhand\/Egym Machine\s+/i, "")
    .replace(/^Barbell\s+/i, "")
    .replace(/^Machine\s+/i, "")
    .trim();
}

let _activeEx   = null;
let _activeCat  = "all";

const EX_CAT_PATTERNS = {
  push:      [/bench press/i, /\bincline\b/i, /chest press/i, /\bfly\b/i, /\bflies\b/i, /cable fly/i, /\bdip\b/i, /dips\b/i, /chest.supported.*press/i],
  pull:      [/pulldown/i, /pull.up/i, /pullover/i, /\brow\b/i, /\brows\b/i, /\bshrug\b/i, /straight arm lat/i, /kelso/i, /face pull/i],
  lower:     [/deadlift/i, /squat/i, /leg press/i, /leg curl/i, /leg extension/i, /hip thrust/i, /calf raise/i, /glute/i, /abductor/i, /adductor/i, /tibialis/i],
  shoulders: [/shoulder press/i, /lateral raise/i, /overhead press/i, /front raise/i, /rear delt/i, /neck curl/i, /neck extension/i],
  arms:      [/\bcurl\b/i, /triceps/i, /skull crusher/i, /pushdown/i, /overhead.*extension/i, /hammer curl/i, /bayesian/i],
  core:      [/crunch/i, /sit.up/i, /cable.*crunch/i, /hip abduction/i, /ab\b/i],
};

const EX_CAT_LABELS = { all: "All", push: "Push", pull: "Pull", lower: "Lower", shoulders: "Shoulders", arms: "Arms", core: "Core" };

function getExCat(ex) {
  for (const [cat, patterns] of Object.entries(EX_CAT_PATTERNS)) {
    if (patterns.some(p => p.test(ex))) return cat;
  }
  return "other";
}

function setupProgressiveOverload() {
  buildExMap();
  const catRow  = document.getElementById("po-cat-row");
  const listEl  = document.getElementById("po-exercise-list");
  if (!catRow || !listEl) return;

  // Annotate each exercise with its category
  const exWithCat = _exOrder.map(ex => ({ ex, cat: getExCat(ex), n: _exMap[ex].length }));

  // Build category pills (only show categories that have exercises)
  const presentCats = ["all", ...Object.keys(EX_CAT_LABELS).filter(c => c !== "all" && exWithCat.some(e => e.cat === c))];
  catRow.innerHTML = presentCats.map(cat => `
    <button class="ex-cat${cat === _activeCat ? " active" : ""}" data-cat="${cat}">${EX_CAT_LABELS[cat] || cat}</button>`
  ).join("");

  function renderList(cat) {
    _activeCat = cat;
    catRow.querySelectorAll(".ex-cat").forEach(b => b.classList.toggle("active", b.dataset.cat === cat));
    const filtered = cat === "all" ? exWithCat : exWithCat.filter(e => e.cat === cat);
    const maxN = Math.max(...filtered.map(e => e.n), 1);
    listEl.innerHTML = filtered.map(({ ex, n }) => {
      const c = _exCred[ex];
      const conf = c ? Math.round(c.confidence * 100) : 0;
      const barColor = conf >= 60 ? "var(--green)" : conf >= 35 ? "var(--yellow)" : "var(--red)";
      const warn = c && c.outlierCount ? `<span class="ex-list-warn" data-tip="${c.outlierCount} suspect point${c.outlierCount > 1 ? "s" : ""}">⚠</span>` : "";
      return `
      <button class="ex-list-item${ex === _activeEx ? " active" : ""}" data-ex="${ex}">
        <span class="ex-list-name">${shortName(ex)}${warn}</span>
        <span class="ex-list-bar"><span class="ex-list-bar-fill" style="width:${conf}%;background:${barColor}"></span></span>
        <span class="ex-list-count">${n}</span>
      </button>`;
    }).join("");
  }

  function selectEx(ex) {
    _activeEx = ex;
    listEl.querySelectorAll(".ex-list-item").forEach(el =>
      el.classList.toggle("active", el.dataset.ex === ex)
    );
    renderProgressiveOverload(ex);
  }

  catRow.addEventListener("click", e => {
    const btn = e.target.closest(".ex-cat");
    if (btn) renderList(btn.dataset.cat);
  });

  listEl.addEventListener("click", e => {
    const item = e.target.closest(".ex-list-item");
    if (item) selectEx(item.dataset.ex);
  });

  const relBtn = document.getElementById("po-rel-toggle");
  if (relBtn) {
    relBtn.addEventListener("click", () => {
      _relativeMode = !_relativeMode;
      relBtn.classList.toggle("active", _relativeMode);
      if (_activeEx) renderProgressiveOverload(_activeEx);
    });
  }

  renderList("all");
  if (_exOrder.length) selectEx(_exOrder[0]);
}

// ── Muscle heatmap ────────────────────────────────────────────────────────────

const HM_GROUPS = [
  { label: "Push",  muscles: ["Chest", "Triceps", "Front Delts", "Side Delts"] },
  { label: "Pull",  muscles: ["Upper Back", "Lats", "Biceps", "Rear Delts", "Upper Traps", "Forearms"] },
  { label: "Lower", muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Adductors", "Abductors", "Lower Back"] },
  { label: "Core / Other", muscles: ["Abs", "Obliques", "Serratus", "Neck", "Tibialis"] },
];

function renderHeatmap() {
  const weeks = data.push_pull_weekly;
  if (!weeks || !weeks.length) return;

  const last = weeks[weeks.length - 1];
  const grid = document.getElementById("hm-grid");
  if (!grid) return;

  const landmarks = data.config?.muscle_landmarks || {};
  setText("hm-week-label", last.week);

  let html = "";
  for (const group of HM_GROUPS) {
    // Compute group total MPS
    const groupTotal = group.muscles.reduce((sum, m) => {
      return sum + (last.muscles?.[m]?.mps || 0);
    }, 0);
    const totalStr = groupTotal > 0 ? ` · ${round1(groupTotal)} MPS` : "";
    html += `<div class="hm-section-label">${group.label}${totalStr}</div>`;

    for (const muscle of group.muscles) {
      const info = last.muscles?.[muscle];
      const zone = info ? info.zone : "none";
      const val  = info ? info.mps  : 0;
      const lm   = landmarks[muscle];
      const mrv  = lm?.mrv || 0;
      const mev  = lm?.mev || 0;
      const pct  = mrv > 0 ? Math.min(val / mrv * 100, 100) : 0;
      const mevPct = mrv > 0 ? Math.min(mev / mrv * 100, 100) : 0;
      const zoneClass = val === 0 ? "none" : zone;
      const zoneLabel = ZONE_LABELS[zoneClass] || (val === 0 ? "no volume" : zoneClass);
      const tip = lm
        ? `${muscle}: ${val > 0 ? val + " MPS" : "no volume"} | MEV ${mev} · MRV ${mrv} | ${zoneLabel}`
        : muscle;

      html += `
        <div class="hm-cell zone-${zoneClass}" data-tip="${tip}">
          <div class="hm-name">${muscle}</div>
          <div class="hm-val">${val > 0 ? val : "—"}</div>
          <div class="hm-bar">
            <div class="hm-bar-fill" style="width:${pct}%"></div>
            ${mevPct > 0 ? `<div class="hm-bar-mev" style="left:${mevPct}%"></div>` : ""}
          </div>
        </div>`;
    }
  }
  grid.innerHTML = html;
}

// ── Strength tab ──────────────────────────────────────────────────────────────

function computeStrengthCards() {
  if (!_exMap) return null;

  const catPatterns = {
    push:  ["bench press", "incline", "dip", "shoulder press", "overhead press"],
    pull:  ["lat pulldown", "pull-up", "pulldown"],
    lower: ["deadlift", "squat", "hip thrust"],
  };

  const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff90 = new Date(); cutoff90.setDate(cutoff90.getDate() - 90);
  const str30 = cutoff30.toISOString().slice(0, 10);
  const str90 = cutoff90.toISOString().slice(0, 10);

  const cards = {};

  for (const [cat, patterns] of Object.entries(catPatterns)) {
    let recentBest = null, prevBest = null;

    for (const [ex, entries] of Object.entries(_exMap)) {
      const exLower = ex.toLowerCase();
      if (!patterns.some(p => exLower.includes(p))) continue;
      const c = _exCred[ex];
      const oFlags = c ? c.outliers : entries.map(() => false);
      for (let i = 0; i < entries.length; i++) {
        if (oFlags[i]) continue; // skip outliers
        const e = entries[i];
        if (e.date >= str30) {
          if (!recentBest || e.e1rm > recentBest.val) {
            recentBest = { val: e.e1rm, ex };
          }
        } else if (e.date >= str90) {
          if (!prevBest || e.e1rm > prevBest.val) {
            prevBest = { val: e.e1rm };
          }
        }
      }
    }

    const delta = recentBest && prevBest
      ? round1(recentBest.val - prevBest.val)
      : null;
    const pct = recentBest && prevBest
      ? round1((recentBest.val - prevBest.val) / prevBest.val * 100)
      : null;

    cards[cat] = {
      current: recentBest ? Math.round(recentBest.val) : null,
      bestEx: recentBest?.ex || null,
      delta,
      pct,
    };
  }

  // Composite score = sum of best push + pull + lower
  const push = cards.push?.current || 0;
  const pull = cards.pull?.current || 0;
  const lower = cards.lower?.current || 0;
  const pushPrev = (cards.push?.current || 0) - (cards.push?.delta || 0);
  const pullPrev = (cards.pull?.current || 0) - (cards.pull?.delta || 0);
  const lowerPrev = (cards.lower?.current || 0) - (cards.lower?.delta || 0);
  const totalCurrent = push + pull + lower;
  const totalPrev = pushPrev + pullPrev + lowerPrev;
  const totalDelta = totalCurrent && totalPrev ? Math.round(totalCurrent - totalPrev) : null;
  const totalPct  = totalCurrent && totalPrev ? round1((totalCurrent - totalPrev) / totalPrev * 100) : null;

  cards.total = { current: totalCurrent || null, delta: totalDelta, pct: totalPct };

  return cards;
}

function renderStrengthTab() {
  buildExMap();
  const cards = computeStrengthCards();
  if (!cards) return;

  function setStrCard(valId, subId, data, unit = " kg") {
    const valEl = document.getElementById(valId);
    const subEl = document.getElementById(subId);
    if (!valEl || !subEl) return;
    if (data.current) {
      valEl.textContent = data.current + unit;
      if (data.delta !== null) {
        const sign = data.delta > 0 ? "+" : "";
        const cls = data.delta > 0 ? "trend-good" : data.delta < 0 ? "trend-bad" : "trend-neutral";
        subEl.innerHTML = `<span class="${cls}">${sign}${data.delta} kg (${sign}${data.pct}%)</span> vs prev 60d`;
      } else {
        subEl.textContent = "no prior data";
      }
    } else {
      valEl.textContent = "—";
      subEl.textContent = "no data";
    }
  }

  setStrCard("str-push-val",  "str-push-sub",  cards.push);
  setStrCard("str-pull-val",  "str-pull-sub",  cards.pull);
  setStrCard("str-lower-val", "str-lower-sub", cards.lower);
  setStrCard("str-total-val", "str-total-sub", cards.total);

  // Strength standards uses allTimePR — rendered after renderTraining populates _allTimePR
  // Called again after renderTraining() in loadData, so this is safe.
  renderStrengthStandards(_allTimePR, data.summary?.trend_kg);
}

// ── Training tab ──────────────────────────────────────────────────────────────

function renderTraining() {
  const workouts = data.workouts;
  if (!workouts || !workouts.length) return;

  buildExMap();  // ensure _exMap is populated before PR calculation

  // ── Build all-time PR map: exercise → {weight_kg, reps, e1rm, date} ───────
  const allTimePR  = _allTimePR;  // use module-level so Strength tab can access it
  const setCount   = {};  // exercise → total set count (for ranking)

  for (const w of workouts) {
    for (const s of w.sets) {
      if (!s.weight_kg || !s.reps || s.set_type === "Drop") continue;
      const ex = s.exercise;
      setCount[ex] = (setCount[ex] || 0) + 1;
      // Use effective weight from _exMap if available (handles assisted correctly)
      const mapEntry = _exMap?.[ex]?.find(e => e.date === w.date);
      const e1rm = mapEntry ? mapEntry.e1rm : s.weight_kg * (1 + s.reps / 30);
      if (!allTimePR[ex] || e1rm > allTimePR[ex].e1rm) {
        allTimePR[ex] = { weight_kg: s.weight_kg, reps: s.reps, e1rm, date: w.date, isAssisted: s.weight_kg < 0 };
      }
    }
  }

  // ── RIR trend + session volume charts ────────────────────────────────────
  const recent30 = workouts.slice(-30);
  const wLabels  = recent30.map(w => w.date.slice(5));

  const avgRirs = recent30.map(w => {
    const qs = w.sets.filter(s => s.rir != null && s.set_type !== "Drop");
    return qs.length ? round1(qs.reduce((a, s) => a + s.rir, 0) / qs.length) : null;
  });

  makeLineChart("rir-trend-chart", wLabels, [{
    label: "Avg RIR",
    data: avgRirs,
    borderColor: ACCENT2,
    backgroundColor: ACCENT2 + "20",
    fill: true,
    tension: 0.3,
    spanGaps: false,
  }], { y: { min: 0, max: 4, ticks: { stepSize: 1 } } }, [
    zoneBands([
      { min: 0, max: 1, color: "rgba(74,222,128,0.06)"  },
      { min: 1, max: 3, color: "rgba(251,191,36,0.05)"  },
      { min: 3, max: 5, color: "rgba(255,255,255,0.02)" },
    ]),
  ]);

  const sessionSets = recent30.map(w => w.sets.filter(s => s.set_type !== "Drop").length);
  const avgSets = Math.round(sessionSets.reduce((a, v) => a + v, 0) / sessionSets.length);

  destroyChart("session-vol-chart");
  const svEl = document.getElementById("session-vol-chart");
  if (!svEl) return;
  const ctxSV = svEl.getContext("2d");
  charts["session-vol-chart"] = new Chart(ctxSV, {
    type: "bar",
    data: {
      labels: wLabels,
      datasets: [
        {
          label: "Sets",
          data: sessionSets,
          backgroundColor: sessionSets.map(v => v > avgSets * 1.3 ? "#ff5757cc" : ACCENT + "99"),
          borderRadius: 2,
          order: 2,
        },
        {
          type: "line",
          label: "avg",
          data: wLabels.map(() => avgSets),
          borderColor: MUTED,
          borderDash: [4, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label === "avg"
              ? ` Avg: ${ctx.parsed.y} sets`
              : ctx.parsed.y > avgSets * 1.3
                ? ` Sets: ${ctx.parsed.y} ⚡ spike (>130% avg)`
                : ` Sets: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { ticks: { stepSize: 5 } },
      },
    },
  });

  // ── PR list: top 10 exercises ─────────────────────────────────────────────
  const topEx = Object.entries(setCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ex]) => ex);

  const bwNowPR = data.summary?.trend_kg;
  const prList = document.getElementById("pr-list");
  if (prList) {
    prList.innerHTML = topEx.map(ex => {
      const pr = allTimePR[ex];
      const cred = _exCred[ex];
      const e1rm = cred ? cred.credibleE1rm : Math.round(pr.e1rm);
      const rawBest = Math.round(pr.e1rm);
      const isSuspect = cred && cred.outlierCount > 0 && rawBest !== Math.round(cred.credibleE1rm);
      const weightStr = pr.isAssisted
        ? `${Math.abs(pr.weight_kg)} kg↑ × ${pr.reps}`
        : `${pr.weight_kg} kg × ${pr.reps}`;

      // Tier badge for matched exercises (uses credible e1RM)
      let tierBadge = "";
      const stdKey = getStandardsKey(ex);
      if (stdKey && bwNowPR && classifyEquipment(ex) !== "egym") {
        const thresholds = getStandardsForBW(stdKey, bwNowPR);
        if (thresholds) {
          const isPullDip = stdKey === "pull-ups" || stdKey === "dips";
          // For pull-ups/dips: e1RM-equivalent added weight
          const compVal = isPullDip ? round1(e1rm - (getBW(pr.date) || bwNowPR)) : e1rm;
          const cls = classifyLift(compVal, thresholds);
          const badgeColors = {
            below: "color:var(--muted);background:rgba(255,255,255,0.05)",
            beginner: "color:var(--zone-below);background:rgba(59,130,246,0.12)",
            novice: "color:var(--zone-ok);background:rgba(34,197,94,0.12)",
            intermediate: "color:var(--zone-high);background:rgba(245,158,11,0.12)",
            advanced: "color:var(--accent);background:rgba(232,255,87,0.12)",
            elite: "color:var(--accent2);background:rgba(87,200,255,0.15)",
          };
          const label = cls.tier === "below" ? "dev" : cls.tier.slice(0, 3).toUpperCase();
          const style = badgeColors[cls.tier] || badgeColors.below;
          tierBadge = `<span style="font-size:0.6rem;font-weight:700;padding:0.08rem 0.3rem;border-radius:3px;letter-spacing:0.04em;margin-left:0.35rem;${style}">${label}</span>`;
        }
      }

      const warnBadge = isSuspect
        ? `<span style="color:var(--red);font-size:0.6rem;margin-left:0.25rem" data-tip="Raw PR: ~${rawBest} kg — outlier detected, showing Bayesian estimate">⚠</span>` : "";
      const ciStr = cred ? ` ±${cred.ci}` : "";

      return `
        <div class="pr-row" data-exercise="${ex}" data-tip="Click to see overload chart">
          <span class="pr-name">${ex}</span>
          <span class="pr-best">${weightStr}</span>
          <span class="pr-meta">${pr.date.slice(5)} · <span data-tip="Bayesian e1RM estimate${cred ? ` (conf ${Math.round(cred.confidence * 100)}%, ${cred.equipType})` : ""}">~${Math.round(e1rm)}${ciStr} kg</span>${warnBadge}${tierBadge}</span>
        </div>`;
    }).join("");

    // Drill-through: click PR row → switch to Strength tab + show PO chart
    prList.querySelectorAll(".pr-row[data-exercise]").forEach(row => {
      row.addEventListener("click", () => {
        const ex = row.dataset.exercise;
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
        const strengthTab = document.querySelector('[data-tab="strength"]');
        const strengthSection = document.getElementById("strength");
        if (strengthTab) strengthTab.classList.add("active");
        if (strengthSection) strengthSection.classList.add("active");
        if (_exMap?.[ex]) {
          _activeEx = ex;
          document.querySelectorAll(".ex-list-item").forEach(el =>
            el.classList.toggle("active", el.dataset.ex === ex)
          );
          renderProgressiveOverload(ex);
          document.getElementById("po-chart")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
  }

  // ── Workout accordion ─────────────────────────────────────────────────────
  const list = document.getElementById("workout-list");
  if (!list) return;

  const recent = [...workouts].reverse().slice(0, 20);

  // Compute average weekly MPS per session for coloring
  const allSessionMPS = recent.map(w => w.sets.reduce((sum, s) => sum + (s.set_mps || 0), 0));
  const avgSessionMPS = allSessionMPS.reduce((a, b) => a + b, 0) / (allSessionMPS.length || 1);

  list.innerHTML = recent.map((w, idx) => {
    const dur = w.duration_sec ? Math.round(w.duration_sec / 60) + " min" : "";
    const totalSets = w.sets.filter(s => s.set_type !== "Drop").length;
    const sessionMPS = allSessionMPS[idx];
    const mpsStr = sessionMPS > 0 ? ` · <span style="color:${sessionMPS >= avgSessionMPS ? "var(--green)" : "var(--muted)"}">${round1(sessionMPS)} MPS</span>` : "";

    // Group sets by exercise
    const byEx = {};
    for (const s of w.sets) {
      if (!byEx[s.exercise]) byEx[s.exercise] = [];
      byEx[s.exercise].push(s);
    }

    const exGroups = Object.entries(byEx).map(([ex, sets]) => {
      const isPR = allTimePR[ex]?.date === w.date &&
        sets.some(s => s.weight_kg === allTimePR[ex].weight_kg && s.reps === allTimePR[ex].reps);
      const prBadge = isPR ? `<span class="badge-pr">PR</span>` : "";

      const chips = sets.map(s => {
        const rir = s.rir != null ? `@${s.rir}` : "";
        const wStr = Math.abs(s.weight_kg || 0);
        const assisted = s.weight_kg < 0 ? "↑" : "";
        const typeSuffix = s.set_type === "Drop" ? "↓" : s.set_type === "Failure Set" ? "✕" : "";
        const chipClass = s.set_type === "Drop" ? "chip-drop"
          : s.rir === 0 || s.set_type === "Failure Set" ? "chip-r0"
          : s.rir === 1 ? "chip-r1"
          : s.rir === 2 ? "chip-r2"
          : "";
        return `<div class="set-chip ${chipClass}">${wStr}${assisted}×${s.reps}${rir}${typeSuffix}</div>`;
      }).join("");

      return `
        <div class="ex-group">
          <span class="ex-label">${prBadge}${ex} (${sets.length})</span>
          <div class="sets-grid">${chips}</div>
        </div>`;
    }).join("");

    const name = w.workout_name || "Workout";
    return `
      <details>
        <summary>
          <span class="workout-date">${w.date.slice(5)}</span>
          <span class="workout-title">${name}</span>
          <span class="workout-meta">${totalSets} sets${dur ? " · " + dur : ""}${mpsStr}</span>
        </summary>
        ${exGroups}
      </details>`;
  }).join("");
}

// ── Volume tab ────────────────────────────────────────────────────────────────

const ZONE_COLORS = {
  below: "var(--zone-below)",
  ok:    "var(--zone-ok)",
  high:  "var(--zone-high)",
  over:  "var(--zone-over)",
};

const ZONE_LABELS = {
  below: "below MEV",
  ok:    "MEV → MAV",
  high:  "MAV → MRV",
  over:  "above MRV",
};

function zonePill(zone) {
  const cls = zone === "below" ? "pill-blue"
            : zone === "ok"    ? "pill-green"
            : zone === "high"  ? "pill-yellow"
            : "pill-red";
  return `<span class="pill ${cls}">${ZONE_LABELS[zone] || zone}</span>`;
}

function renderVolume() {
  const weeks = data.push_pull_weekly;
  if (!weeks || !weeks.length) return;

  const lm   = data.config.volume_landmarks;
  const last  = weeks[weeks.length - 1];
  const labels = weeks.map(w => w.week.replace(/\d{4}-/, ""));

  // ── Stat cards (current week) ────────────────────────────────────────────
  // MPS value cards with animated counter
  const pushEl = document.getElementById("vol-push-mps");
  const pullEl = document.getElementById("vol-pull-mps");
  const lowerEl = document.getElementById("vol-lower-mps");
  animateValue(pushEl,  last.push_mps  ?? 0, "", 1);
  animateValue(pullEl,  last.pull_mps  ?? 0, "", 1);
  animateValue(lowerEl, last.lower_mps ?? 0, "", 1);

  document.getElementById("vol-push-zone").innerHTML  = zonePill(last.push_zone);
  document.getElementById("vol-pull-zone").innerHTML  = zonePill(last.pull_zone);
  document.getElementById("vol-lower-zone").innerHTML = zonePill(last.lower_zone);

  // Mini fill bars (% of MAV)
  function setFillBar(id, mps, mav, zone) {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = mav > 0 ? Math.min(mps / mav * 100, 100) : 0;
    el.style.width = pct.toFixed(1) + "%";
    el.style.background = zone === "below" ? "var(--zone-below)"
      : zone === "ok"   ? "var(--zone-ok)"
      : zone === "high" ? "var(--zone-high)"
      : "var(--zone-over)";
  }
  setFillBar("vol-push-fill",  last.push_mps  ?? 0, lm.Push.mav,  last.push_zone);
  setFillBar("vol-pull-fill",  last.pull_mps  ?? 0, lm.Push.mav,  last.pull_zone);
  setFillBar("vol-lower-fill", last.lower_mps ?? 0, lm.Lower.mav, last.lower_zone);

  const ratio = last.push_pull_ratio;
  const balEl = document.getElementById("vol-balance");
  if (balEl) {
    animateValue(balEl, ratio ?? 0, "", 2);
    const balanced = ratio != null && ratio >= 0.87 && ratio <= 1.15;
    const extreme  = ratio != null && (ratio < 0.70 || ratio > 1.30);
    balEl.className = "card-value " + (balanced ? "trend-good" : extreme ? "trend-bad" : "trend-warn");
  }
  const balanceDesc = ratio == null ? "" :
    ratio > 1.15 ? "push dominant" :
    ratio < 0.87 ? "pull dominant" : "balanced";
  const balLblEl = document.getElementById("vol-balance-label");
  if (balLblEl) {
    balLblEl.textContent = balanceDesc;
    balLblEl.className = "card-sub " + (balanceDesc === "balanced" ? "trend-good" : balanceDesc ? "trend-warn" : "");
  }

  // ── Helper: reference line dataset ──────────────────────────────────────
  function refLine(value, color, dash = [4, 3]) {
    return {
      type: "line",
      data: labels.map(() => value),
      borderColor: color,
      borderWidth: 1.5,
      borderDash: dash,
      pointRadius: 0,
      order: 0,
    };
  }

  // ── Chart 1: Push vs Pull ────────────────────────────────────────────────
  destroyChart("vol-push-pull-chart");
  const ppEl = document.getElementById("vol-push-pull-chart");
  if (!ppEl) return;
  const ctx1 = ppEl.getContext("2d");
  charts["vol-push-pull-chart"] = new Chart(ctx1, {
    type: "bar",
    plugins: [annotateLines([
      { value: lm.Push.mev, label: "MEV", color: "var(--zone-ok)"   },
      { value: lm.Push.mav, label: "MAV", color: "var(--zone-high)" },
      { value: lm.Push.mrv, label: "MRV", color: "var(--zone-over)" },
    ])],
    data: {
      labels,
      datasets: [
        {
          label: "Push MPS",
          data: weeks.map(w => w.push_mps),
          backgroundColor: ACCENT + "bb",
          borderRadius: 3,
          order: 2,
        },
        {
          label: "Pull MPS",
          data: weeks.map(w => w.pull_mps),
          backgroundColor: ACCENT2 + "bb",
          borderRadius: 3,
          order: 2,
        },
        { label: "MEV", ...refLine(lm.Push.mev,  "var(--zone-ok)") },
        { label: "MAV", ...refLine(lm.Push.mav,  "var(--zone-high)") },
        { label: "MRV", ...refLine(lm.Push.mrv,  "var(--zone-over)") },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (["MEV", "MAV", "MRV"].includes(ctx.dataset.label)) return null;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y} MPS`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0 } },
        y: { ticks: { callback: v => v } },
      },
    },
  });

  // ── Chart 2: Upper vs Lower ──────────────────────────────────────────────
  destroyChart("vol-upper-lower-chart");
  const ulEl = document.getElementById("vol-upper-lower-chart");
  if (!ulEl) return;
  const ctx2 = ulEl.getContext("2d");
  charts["vol-upper-lower-chart"] = new Chart(ctx2, {
    type: "bar",
    plugins: [annotateLines([
      { value: lm.Upper.mev, label: "U·MEV", color: "var(--zone-ok)"   },
      { value: lm.Upper.mrv, label: "U·MRV", color: "var(--zone-over)" },
      { value: lm.Lower.mev, label: "L·MEV", color: "var(--zone-ok)"   },
      { value: lm.Lower.mrv, label: "L·MRV", color: "var(--zone-over)" },
    ])],
    data: {
      labels,
      datasets: [
        {
          label: "Upper MPS",
          data: weeks.map(w => w.upper_mps),
          backgroundColor: "#c084fc" + "bb",
          borderRadius: 3,
          order: 2,
        },
        {
          label: "Lower MPS",
          data: weeks.map(w => w.lower_mps),
          backgroundColor: GREEN + "bb",
          borderRadius: 3,
          order: 2,
        },
        { label: "Upper MEV", ...refLine(lm.Upper.mev, "var(--zone-ok)") },
        { label: "Upper MRV", ...refLine(lm.Upper.mrv, "var(--zone-over)") },
        { label: "Lower MEV", ...refLine(lm.Lower.mev, "var(--zone-ok)", [2, 2]) },
        { label: "Lower MRV", ...refLine(lm.Lower.mrv, "var(--zone-over)", [2, 2]) },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.includes("MEV") || ctx.dataset.label.includes("MRV")) return null;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y} MPS`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0 } },
        y: { ticks: { callback: v => v } },
      },
    },
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadData().catch(err => {
  document.querySelector("body").innerHTML =
    `<p style="color:#f66;padding:2rem">Failed to load data.json: ${err.message}</p>`;
});
