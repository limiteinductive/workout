// ── Chart.js defaults ────────────────────────────────────────────────────────

Chart.defaults.color = "#888";
Chart.defaults.borderColor = "#2a2a2a";

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

  renderCoachSummary();
  renderBodyComp(30);
  renderCutProgress();
  renderTdeeChart(30);
  renderDeficitChart();
  setupViewToggle();
  setupTabs();
  setupBodyCompRange();
  setupTdeeRange();
}

// ── View toggle (Coach / Athlete) ─────────────────────────────────────────────

function setupViewToggle() {
  const saved = localStorage.getItem("wod-view") || "coach";
  setView(saved);

  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
}

function setView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelector(`.toggle-btn[data-view="${view}"]`).classList.add("active");
  localStorage.setItem("wod-view", view);
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

function makeLineChart(id, labels, datasets, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext("2d");
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { ...opts.y },
      },
      elements: { point: { radius: 2, hoverRadius: 5 } },
    },
  });
  return charts[id];
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

// ── Coach summary ─────────────────────────────────────────────────────────────

function renderCoachSummary() {
  const s = data.summary;
  if (!s) return;

  const delta = s.weight_delta_7d != null
    ? `${s.weight_delta_7d >= 0 ? "+" : ""}${s.weight_delta_7d.toFixed(2)} kg / week`
    : "";

  const ffmiRef = s.ffmi >= 28 ? "elite" : s.ffmi >= 25 ? "advanced" : s.ffmi >= 22 ? "average" : "below avg";

  // Athlete tab cards
  setText("bc-weight",       `${s.trend_kg} kg`);
  setText("bc-weight-delta", delta);
  setText("bc-lean",         `${s.lean_kg} kg`);
  setText("bc-lean-trend",   `${s.lean_trend} lean mass`);
  setText("bc-bf",           `${s.estimated_bf_pct}%`);
  setText("bc-ffmi",         `${s.ffmi}`);
  setText("bc-ffmi-ref",     ffmiRef);

  // Coach view cards (same values)
  setText("cb-weight",       `${s.trend_kg} kg`);
  setText("cb-weight-delta", delta);
  setText("cb-lean",         `${s.lean_kg} kg`);
  setText("cb-lean-trend",   `${s.lean_trend} lean mass`);
  setText("cb-bf",           `${s.estimated_bf_pct}%`);
  setText("cb-ffmi",         `${s.ffmi}`);
  setText("cb-ffmi-ref",     ffmiRef);
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
  ], { y: { min: yMin, max: yMax } });

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
  ], { y: { min: ffmiMin, max: ffmiMax } });

  // Chart 3: BF% estimates + scale (unreliable)
  const hcBf = data.hc_body_fat;
  const hcByDate = {};
  hcBf.forEach(e => { hcByDate[e.date] = e.pct; });

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
  ], { y: { min: 10, max: 45 } });
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
  const ctx = document.getElementById("tdee-chart").getContext("2d");
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
  const ctx = document.getElementById("deficit-chart").getContext("2d");
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
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Deficit: ${ctx.parsed.y} kcal`,
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

// ── Init ──────────────────────────────────────────────────────────────────────

loadData().catch(err => {
  document.querySelector("body").innerHTML =
    `<p style="color:#f66;padding:2rem">Failed to load data.json: ${err.message}</p>`;
});
