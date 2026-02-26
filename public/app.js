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
  setupViewToggle();
  setupTabs();
  setupBodyCompRange();
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

// ── Init ──────────────────────────────────────────────────────────────────────

loadData().catch(err => {
  document.querySelector("body").innerHTML =
    `<p style="color:#f66;padding:2rem">Failed to load data.json: ${err.message}</p>`;
});
