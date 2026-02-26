// Chart.js default theme
Chart.defaults.color = "#888";
Chart.defaults.borderColor = "#2a2a2a";

const ACCENT = "#e8ff57";
const ACCENT2 = "#57c8ff";

let data = null;
let weightChartFull = null;

async function loadData() {
  const res = await fetch("./data.json");
  data = await res.json();

  const d = new Date(data.generated_at);
  document.getElementById("last-updated").textContent =
    `Updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  renderOverview();
  renderWorkouts();
  renderNutrition();
}

// ── TABS ────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── HELPERS ─────────────────────────────────────────────────────────────────

function filterLast(arr, days, dateKey = "date") {
  if (!days) return arr;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return arr.filter((r) => r[dateKey] >= cutStr);
}

function fmt(val, unit) {
  return val != null ? `${val}${unit}` : "—";
}

function makeLineChart(id, labels, datasets, opts = {}) {
  const ctx = document.getElementById(id).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: datasets.length > 1 } },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { ...opts.y },
      },
      elements: { point: { radius: 3, hoverRadius: 5 } },
    },
  });
}

function makeBarChart(id, labels, values, color = ACCENT) {
  const ctx = document.getElementById(id).getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: color + "99", borderColor: color, borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } } },
    },
  });
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────

function renderOverview() {
  // Weight
  const w = data.weight;
  if (w.length) {
    const latest = w[w.length - 1];
    document.getElementById("current-weight").textContent = `${latest.kg} kg`;
    if (w.length > 1) {
      const prev = w[w.length - 2];
      const diff = (latest.kg - prev.kg).toFixed(1);
      const sign = diff > 0 ? "+" : "";
      document.getElementById("weight-change").textContent = `${sign}${diff} kg vs yesterday`;
    }
  }

  // Body fat
  const bf = data.body_fat;
  if (bf.length) {
    const latest = bf[bf.length - 1];
    document.getElementById("current-bf").textContent = `${latest.pct}%`;
    document.getElementById("bf-date").textContent = `as of ${latest.date}`;
  }

  // Nutrition
  const today = new Date().toISOString().slice(0, 10);
  const nutrition = data.nutrition;
  const todayNutrition =
    nutrition.find((n) => n.date === today) || nutrition[nutrition.length - 1];
  if (todayNutrition) {
    document.getElementById("today-kcal").textContent = `${Math.round(todayNutrition.kcal)} kcal`;
    document.getElementById("today-protein").textContent = `${todayNutrition.protein_g}g protein`;
  }

  // Last workout
  const workouts = data.workouts.filter((w) => w.title);
  if (workouts.length) {
    const last = workouts[0];
    document.getElementById("last-workout-title").textContent = last.title || "Workout";
    document.getElementById("last-workout-date").textContent = `${last.date} · ${last.duration_min} min`;
  }

  // Weight chart (90d)
  const w90 = filterLast(w, 90);
  makeLineChart(
    "weight-chart-overview",
    w90.map((r) => r.date),
    [{
      data: w90.map((r) => r.kg),
      borderColor: ACCENT,
      backgroundColor: ACCENT + "15",
      fill: true,
      tension: 0.3,
    }],
    { y: { min: Math.min(...w90.map((r) => r.kg)) - 1 } }
  );
}

// ── WORKOUTS ─────────────────────────────────────────────────────────────────

function renderWeightChart(days) {
  const filtered = filterLast(data.weight, days);
  const min = Math.min(...filtered.map((r) => r.kg));

  if (weightChartFull) weightChartFull.destroy();
  weightChartFull = makeLineChart(
    "weight-chart-full",
    filtered.map((r) => r.date),
    [{
      data: filtered.map((r) => r.kg),
      borderColor: ACCENT,
      backgroundColor: ACCENT + "15",
      fill: true,
      tension: 0.3,
    }],
    { y: { min: min - 1 } }
  );
}

function renderWorkouts() {
  // Weight chart with range selector
  renderWeightChart(30);
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderWeightChart(parseInt(btn.dataset.range));
    });
  });

  // Body fat chart
  const bf = data.body_fat;
  makeLineChart(
    "bf-chart",
    bf.map((r) => r.date),
    [{
      data: bf.map((r) => r.pct),
      borderColor: ACCENT2,
      backgroundColor: ACCENT2 + "15",
      fill: true,
      tension: 0.3,
      spanGaps: false,
    }],
    { y: { min: Math.min(...bf.map((r) => r.pct)) - 2 } }
  );

  // Workout session list
  const list = document.getElementById("workout-list");
  const workouts = data.workouts.slice(0, 60); // last 60 sessions

  workouts.forEach((w) => {
    const el = document.createElement("details");
    const setCount = w.segments.length;
    const totalReps = w.segments.reduce((s, seg) => s + (seg.reps || 0), 0);

    el.innerHTML = `
      <summary>
        <span class="workout-date">${w.date}</span>
        <span>
          <div class="workout-title">${w.title || "Workout"}</div>
          <div class="workout-meta">${w.duration_min} min · ${setCount} sets · ${totalReps} reps</div>
        </span>
      </summary>
      <div class="segments">
        <div class="segments-grid">
          ${w.segments.map((seg, i) =>
            `<div class="set-chip">Set ${i + 1}: <span>${seg.reps} reps</span>${seg.weight_kg ? ` @ <span>${seg.weight_kg}kg</span>` : ""}</div>`
          ).join("")}
        </div>
      </div>
    `;
    list.appendChild(el);
  });
}

// ── NUTRITION ─────────────────────────────────────────────────────────────────

function renderNutrition() {
  const today = new Date().toISOString().slice(0, 10);
  const nutrition = data.nutrition;
  const todayData = nutrition.find((n) => n.date === today) || nutrition[nutrition.length - 1];

  if (todayData) {
    document.getElementById("n-kcal").textContent = `${Math.round(todayData.kcal)} kcal`;
    document.getElementById("n-protein").textContent = `${todayData.protein_g}g`;
    document.getElementById("n-carbs").textContent = `${todayData.carbs_g}g`;
    document.getElementById("n-fat").textContent = `${todayData.fat_g}g`;
    document.getElementById("n-date").textContent =
      todayData.date === today ? "Today" : `Most recent: ${todayData.date}`;
  }

  const last30 = filterLast(nutrition, 30);
  const labels = last30.map((n) => n.date.slice(5)); // MM-DD

  makeBarChart("kcal-chart", labels, last30.map((n) => Math.round(n.kcal)));
  makeLineChart(
    "protein-chart",
    labels,
    [{
      data: last30.map((n) => n.protein_g),
      borderColor: ACCENT2,
      backgroundColor: ACCENT2 + "20",
      fill: true,
      tension: 0.3,
    }],
    { y: { min: 0 } }
  );
}

// ── INIT ─────────────────────────────────────────────────────────────────────

loadData().catch((err) => {
  document.querySelector("main").innerHTML =
    `<p style="color:#f66;padding:1rem">Failed to load data.json: ${err.message}</p>`;
});
