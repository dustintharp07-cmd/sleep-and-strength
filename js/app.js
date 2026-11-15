/* ==========================================================================
   Sleep & Strength — Interactive Platform Logic (js/app.js)
   Drives:
   1. Multi-section SPA navigation (Overview, Interactive Explorer, The Story)
   2. Homepage Dual-Lens Flagship Visualization (N = 10,987, Ages 16-80+)
   3. Real-Time Cross-Filtering Data Explorer
   ========================================================================== */

let currentView = "overview";
let currentLens = "surface";
let currentSex = "All";
let activeMetric = "cg";
let rightPanelMode = "lifespan";
let explorerInitialized = false;

const selectedAges = new Set(["16-29", "30-44", "45-59", "60-74", "75-80+"]);
const selectedSleeps = new Set([
  "Very Short (<=5h)",
  "Short (6h)",
  "Recommended (7-8h)",
  "Long (9+h)"
]);

const AGE_PALETTE = {
  "16-29": "#38bdf8",
  "30-44": "#2dd4bf",
  "45-59": "#a78bfa",
  "60-74": "#818cf8",
  "75-80+": "#f472b6"
};

const SLEEP_PALETTE = {
  "Very Short (<=5h)": "#a78bfa",
  "Short (6h)": "#38bdf8",
  "Recommended (7-8h)": "#2dd4bf",
  "Long (9+h)": "#818cf8"
};

/* ---------- Navigation ---------- */
function switchView(viewName, scrollToId) {
  currentView = viewName;
  ["overview", "explorer", "story"].forEach(v => {
    const sec = document.getElementById("view-" + v);
    const btn = document.getElementById("nav-btn-" + v);
    if (sec) sec.classList.toggle("active", v === viewName);
    if (btn) btn.classList.toggle("active", v === viewName);
  });

  if (history.replaceState) {
    history.replaceState(null, "", "#" + viewName);
  }

  if (viewName === "overview") {
    setTimeout(() => {
      const el = document.getElementById("hero-flagship-plot");
      if (el && window.Plotly) Plotly.Plots.resize(el);
      if (scrollToId) {
        const target = document.getElementById(scrollToId);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 30);
  } else if (viewName === "explorer") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      if (!explorerInitialized) {
        updateExplorer();
        explorerInitialized = true;
      } else {
        ["plot-age-trajectories", "plot-sleep-boxes", "plot-right-panel"].forEach(id => {
          const el = document.getElementById(id);
          if (el && window.Plotly) Plotly.Plots.resize(el);
        });
      }
    }, 30);
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* ---------- Statistical Helpers ---------- */
function mean(arr) {
  if (!arr.length) return NaN;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function sd(arr, m) {
  if (arr.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

function quantileSorted(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function sleepBinLabel(h) {
  if (h <= 4) return "≤4h";
  if (h >= 10) return "10+h";
  return h + "h";
}

/* ---------- Homepage Flagship Visual ---------- */
function renderHeroSurface() {
  const d = HERO_DATA.surface[currentSex];
  const colorscale = [
    [0.0, "#131836"],
    [0.25, "#3b2d71"],
    [0.50, "#0e7490"],
    [0.75, "#22d3ee"],
    [1.0, "#2dd4bf"]
  ];

  const heatTrace = {
    type: "heatmap",
    x: d.x,
    y: d.y,
    z: d.z,
    text: d.hover,
    hoverinfo: "text",
    zsmooth: "best",
    colorscale: colorscale,
    colorbar: {
      title: { text: "Mean Grip (kg)", font: { color: "#cbd5e1", size: 12 } },
      tickfont: { color: "#94a3b8" },
      bgcolor: "rgba(0,0,0,0)",
      outlinewidth: 0
    }
  };

  const peakTrace = {
    type: "scatter",
    mode: "lines+markers",
    name: "Highest-Mean Sleep Tier per Age Band",
    x: d.peak_x,
    y: d.peak_y,
    customdata: d.peak_z,
    hovertemplate: "<b>%{x}</b> Peak Tier: %{y} (%{customdata} kg)<extra></extra>",
    line: { color: "#f8fafc", width: 2.5, dash: "dot" },
    marker: {
      size: 10,
      color: "#38bdf8",
      line: { color: "#ffffff", width: 2 }
    }
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8,13,26,0.7)",
    margin: { t: 28, r: 25, b: 60, l: 75 },
    font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
    xaxis: {
      title: { text: "Participant Age Band (Years, Ages 16–80+)", font: { size: 13, color: "#e2e8f0" } },
      gridcolor: "rgba(148,163,184,0.10)"
    },
    yaxis: {
      title: { text: "Usual Nightly Sleep Duration", font: { size: 13, color: "#e2e8f0" } },
      gridcolor: "rgba(148,163,184,0.10)"
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.08,
      font: { color: "#e2e8f0", size: 12 }
    }
  };

  Plotly.react("hero-flagship-plot", [heatTrace, peakTrace], layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  });
}

function renderHeroCloud() {
  const p = HERO_DATA.points;
  const q = HERO_DATA.quantiles;

  const categories = [
    "Very Short (<=5h)",
    "Short (6h)",
    "Recommended (7-8h)",
    "Long (9+h)"
  ];
  const traces = [];

  categories.forEach(cat => {
    const idx = [];
    for (let i = 0; i < p.cat.length; i++) {
      if (p.cat[i] === cat) idx.push(i);
    }
    traces.push({
      type: "scattergl",
      mode: "markers",
      name: cat,
      x: idx.map(i => p.x[i]),
      y: idx.map(i => p.y[i]),
      customdata: idx.map(i => [p.raw_h[i], p.age[i], p.sex[i]]),
      hovertemplate:
        "<b>Combined Grip:</b> %{y} kg<br>" +
        "<b>Sleep:</b> %{customdata[0]} hrs<br>" +
        "<b>Age & Sex:</b> %{customdata[1]} yrs (%{customdata[2]})<extra></extra>",
      marker: {
        size: 4.5,
        opacity: 0.34,
        color: SLEEP_PALETTE[cat]
      }
    });
  });

  const qHours = q.map(r => r.sleep_hours);

  traces.push({
    type: "scatter",
    mode: "lines",
    x: qHours,
    y: q.map(r => r.p75),
    line: { width: 1, color: "rgba(34,211,238,0.5)" },
    showlegend: false,
    hoverinfo: "skip"
  });

  traces.push({
    type: "scatter",
    mode: "lines",
    name: "Interquartile Band (25th–75th %ile)",
    x: qHours,
    y: q.map(r => r.p25),
    fill: "tonexty",
    fillcolor: "rgba(34,211,238,0.16)",
    line: { width: 1, color: "rgba(34,211,238,0.5)" },
    hovertemplate: "Sleep %{x}h — 25th %ile: %{y} kg<extra></extra>"
  });

  traces.push({
    type: "scatter",
    mode: "lines+markers",
    name: "Median Combined Grip (50th %ile)",
    x: qHours,
    y: q.map(r => r.p50),
    customdata: q.map(r => [r.mean_g, r.n]),
    hovertemplate:
      "<b>%{x} Hours of Sleep</b> (n = %{customdata[1]})<br>" +
      "Median Grip: %{y} kg<br>" +
      "Mean Grip: %{customdata[0]} kg<extra></extra>",
    line: { color: "#ffffff", width: 3 },
    marker: { size: 8, color: "#22d3ee", line: { color: "#ffffff", width: 2 } }
  });

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8,13,26,0.7)",
    margin: { t: 32, r: 25, b: 60, l: 70 },
    font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
    xaxis: {
      title: {
        text: "Nightly Sleep Duration (Hours, Jittered ±0.3h to Reveal All 10,987 Participants)",
        font: { size: 13, color: "#e2e8f0" }
      },
      tickvals: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      ticktext: ["2h", "3h", "4h", "5h", "6h", "7h", "8h", "9h", "10h", "11h", "12+h"],
      gridcolor: "rgba(148,163,184,0.12)"
    },
    yaxis: {
      title: { text: "Combined Bilateral Grip Strength (kg)", font: { size: 13, color: "#e2e8f0" } },
      gridcolor: "rgba(148,163,184,0.12)"
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.11,
      font: { color: "#e2e8f0", size: 11.5 }
    }
  };

  Plotly.react("hero-flagship-plot", traces, layout, {
    responsive: true,
    displaylogo: false
  });
}

function setHeroLens(lens) {
  currentLens = lens;
  document.getElementById("lens-surface-btn").classList.toggle("active", lens === "surface");
  document.getElementById("lens-cloud-btn").classList.toggle("active", lens === "cloud");
  document.getElementById("sex-toggle-bar").style.display = lens === "surface" ? "flex" : "none";

  const caption = document.getElementById("hero-chart-caption");
  if (lens === "surface") {
    caption.textContent =
      "Smoothed topographic strength surface across seven life-stage bands (ages 16–80+) and seven sleep-duration tiers. Hover any cell for exact sample counts, means, and interquartile ranges, or switch to inspect all 10,987 individual participants.";
    renderHeroSurface();
  } else {
    caption.textContent =
      "Every one of the 10,987 validated NHANES participants rendered via WebGL alongside the empirical 25th–75th percentile ribbon and median trajectory across nightly sleep hours.";
    renderHeroCloud();
  }
}

function setSurfaceSex(sex) {
  currentSex = sex;
  ["All", "Male", "Female"].forEach(s => {
    document.getElementById("sex-" + s).classList.toggle("active", s === sex);
  });
  if (currentLens === "surface") renderHeroSurface();
}

/* ---------- Interactive Data Explorer ---------- */
function toggleChip(el, kind) {
  const val = el.getAttribute("data-val");
  const targetSet = kind === "age" ? selectedAges : selectedSleeps;
  if (targetSet.has(val)) {
    if (targetSet.size === 1) return;
    targetSet.delete(val);
    el.classList.remove("selected");
  } else {
    targetSet.add(val);
    el.classList.add("selected");
  }
  updateExplorer();
}

function setMetric(m) {
  activeMetric = m;
  document.getElementById("metric-cg").classList.toggle("active", m === "cg");
  document.getElementById("metric-mg").classList.toggle("active", m === "mg");
  updateExplorer();
}

function setRightPanel(mode) {
  rightPanelMode = mode;
  document.getElementById("subview-lifespan").classList.toggle("active", mode === "lifespan");
  document.getElementById("subview-demo").classList.toggle("active", mode === "demo");
  document.getElementById("right-panel-title").textContent =
    mode === "lifespan"
      ? "Strength Across the Lifespan (Ages 16–80+)"
      : "Demographic Subgroup Comparison";
  document.getElementById("right-panel-desc").textContent =
    mode === "lifespan"
      ? "Continuous 5-year age trajectories from 16 to 80+ comparing sleep-duration categories across adulthood."
      : "Mean grip strength (±95% CI) across NHANES race/Hispanic origin groups stratified by biological sex.";
  updateExplorer();
}

function resetAllFilters() {
  ["16-29", "30-44", "45-59", "60-74", "75-80+"].forEach(v => selectedAges.add(v));
  ["Very Short (<=5h)", "Short (6h)", "Recommended (7-8h)", "Long (9+h)"].forEach(v =>
    selectedSleeps.add(v)
  );
  document.querySelectorAll(".chip-toggle").forEach(el => el.classList.add("selected"));
  document.getElementById("sex-select").value = "ALL";
  document.getElementById("race-select").value = "ALL";
  document.getElementById("trouble-select").value = "ALL";
  setMetric("cg");
}

function getFilteredIndices() {
  const totalN = RAW.a.length;
  const sexVal = document.getElementById("sex-select").value;
  const raceVal = document.getElementById("race-select").value;
  const troubleVal = document.getElementById("trouble-select").value;
  const idx = [];

  for (let i = 0; i < totalN; i++) {
    if (!selectedAges.has(RAW.ag[i])) continue;
    if (!selectedSleeps.has(RAW.sc[i])) continue;
    if (sexVal !== "ALL" && RAW.s[i] !== sexVal) continue;
    if (raceVal !== "ALL" && RAW.r[i] !== raceVal) continue;
    if (troubleVal !== "ALL" && RAW.ts[i] !== troubleVal) continue;
    const val = RAW[activeMetric][i];
    if (val === null || isNaN(val)) continue;
    idx.push(i);
  }
  return idx;
}

function updateKPIs(idx) {
  const totalN = RAW.a.length;
  const vals = idx.map(i => RAW[activeMetric][i]);
  const n = vals.length;
  const metricName = activeMetric === "cg" ? "Combined Grip" : "Max Hand Grip";
  document.getElementById("kpi-mean-label").textContent = "Mean " + metricName;
  document.getElementById("kpi-n").textContent = n.toLocaleString();
  document.getElementById("kpi-n-pct").textContent =
    ((n / totalN) * 100).toFixed(1) + "% of validated sample (10,987)";

  if (n === 0) {
    document.getElementById("kpi-mean").textContent = "—";
    document.getElementById("kpi-sd").textContent = "No matching observations";
    document.getElementById("kpi-median").textContent = "—";
    document.getElementById("kpi-iqr").textContent = "Adjust filters above";
    document.getElementById("kpi-gap").textContent = "—";
    return;
  }

  const m = mean(vals);
  const s = sd(vals, m);
  const sorted = vals.slice().sort((a, b) => a - b);
  const med = quantileSorted(sorted, 0.5);
  const q25 = quantileSorted(sorted, 0.25);
  const q75 = quantileSorted(sorted, 0.75);

  document.getElementById("kpi-mean").textContent = m.toFixed(1) + " kg";
  document.getElementById("kpi-sd").textContent = "SD: " + s.toFixed(1) + " kg";
  document.getElementById("kpi-median").textContent = med.toFixed(1) + " kg";
  document.getElementById("kpi-iqr").textContent =
    "IQR (25th–75th): " + q25.toFixed(1) + " – " + q75.toFixed(1) + " kg";

  const recVals = [];
  const longVals = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (RAW.sc[i] === "Recommended (7-8h)") recVals.push(RAW[activeMetric][i]);
    else if (RAW.sc[i] === "Long (9+h)") longVals.push(RAW[activeMetric][i]);
  }
  if (recVals.length >= 5 && longVals.length >= 5) {
    const diff = mean(recVals) - mean(longVals);
    const sign = diff >= 0 ? "+" : "";
    document.getElementById("kpi-gap").textContent = sign + diff.toFixed(1) + " kg";
    document.getElementById("kpi-gap-sub").textContent =
      "7–8h (" + mean(recVals).toFixed(1) + " kg) vs 9+h (" + mean(longVals).toFixed(1) + " kg)";
  } else {
    document.getElementById("kpi-gap").textContent = "N/A";
    document.getElementById("kpi-gap-sub").textContent = "Select both 7–8h and 9+h tiers to compare";
  }
}

function renderAgeTrajectories(idx) {
  const bins = ["≤4h", "5h", "6h", "7h", "8h", "9h", "10+h"];
  const ageGroups = ["16-29", "30-44", "45-59", "60-74", "75-80+"].filter(g => selectedAges.has(g));
  const traces = [];

  ageGroups.forEach(ag => {
    const bucket = {};
    bins.forEach(b => (bucket[b] = []));

    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (RAW.ag[i] !== ag) continue;
      const b = sleepBinLabel(RAW.sh[i]);
      bucket[b].push(RAW[activeMetric][i]);
    }

    const xs = [];
    const ys = [];
    const cis = [];
    const ns = [];

    bins.forEach(b => {
      const arr = bucket[b];
      if (arr.length >= 4) {
        const m = mean(arr);
        const ci = 1.96 * (sd(arr, m) / Math.sqrt(arr.length));
        xs.push(b);
        ys.push(Number(m.toFixed(1)));
        cis.push(Number(ci.toFixed(1)));
        ns.push(arr.length);
      }
    });

    traces.push({
      type: "scatter",
      mode: "lines+markers",
      name: "Ages " + ag,
      x: xs,
      y: ys,
      customdata: ns,
      error_y: {
        type: "data",
        array: cis,
        visible: true,
        thickness: 1.4,
        width: 4,
        color: AGE_PALETTE[ag]
      },
      line: { width: 2.8, color: AGE_PALETTE[ag] },
      marker: { size: 8, color: AGE_PALETTE[ag], line: { color: "#050811", width: 1.5 } },
      hovertemplate:
        "<b>Ages " + ag + " &middot; %{x} Sleep</b><br>" +
        "Mean Strength: %{y} kg (&plusmn;%{error_y.array} kg 95% CI)<br>" +
        "Participants: n = %{customdata}<extra></extra>"
    });
  });

  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Max Single-Hand Grip (kg)";
  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8,13,26,0.7)",
    margin: { t: 28, r: 24, b: 56, l: 68 },
    font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
    xaxis: {
      title: { text: "Usual Nightly Sleep Duration", font: { size: 13, color: "#e2e8f0" } },
      categoryorder: "array",
      categoryarray: bins,
      gridcolor: "rgba(148,163,184,0.10)"
    },
    yaxis: {
      title: { text: yTitle, font: { size: 13, color: "#e2e8f0" } },
      gridcolor: "rgba(148,163,184,0.10)"
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.11,
      font: { color: "#e2e8f0", size: 12 }
    }
  };

  Plotly.react("plot-age-trajectories", traces, layout, { responsive: true, displaylogo: false });
}

function renderSleepBoxes(idx) {
  const cats = [
    "Very Short (<=5h)",
    "Short (6h)",
    "Recommended (7-8h)",
    "Long (9+h)"
  ].filter(c => selectedSleeps.has(c));

  const traces = cats.map(cat => {
    const vals = [];
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (RAW.sc[i] === cat) vals.push(RAW[activeMetric][i]);
    }
    return {
      type: "box",
      name: cat
        .replace(" (<=5h)", "\n(≤5h)")
        .replace(" (6h)", "\n(6h)")
        .replace(" (7-8h)", "\n(7–8h)")
        .replace(" (9+h)", "\n(9+h)"),
      y: vals,
      boxmean: true,
      boxpoints: false,
      marker: { color: SLEEP_PALETTE[cat] },
      line: { color: SLEEP_PALETTE[cat], width: 2 },
      fillcolor: "rgba(34, 211, 238, 0.12)"
    };
  });

  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Max Single-Hand Grip (kg)";
  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8,13,26,0.7)",
    margin: { t: 18, r: 18, b: 58, l: 64 },
    showlegend: false,
    font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
    xaxis: { gridcolor: "rgba(148,163,184,0.08)" },
    yaxis: {
      title: { text: yTitle, font: { size: 12.5, color: "#e2e8f0" } },
      gridcolor: "rgba(148,163,184,0.10)"
    }
  };

  Plotly.react("plot-sleep-boxes", traces, layout, { responsive: true, displaylogo: false });
}

function renderRightPanel(idx) {
  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Max Single-Hand Grip (kg)";

  if (rightPanelMode === "lifespan") {
    const ageBins = [
      { label: "16–22", min: 16, max: 22 },
      { label: "23–29", min: 23, max: 29 },
      { label: "30–37", min: 30, max: 37 },
      { label: "38–45", min: 38, max: 45 },
      { label: "46–53", min: 46, max: 53 },
      { label: "54–61", min: 54, max: 61 },
      { label: "62–69", min: 62, max: 69 },
      { label: "70–76", min: 70, max: 76 },
      { label: "77–80+", min: 77, max: 85 }
    ];

    const cats = [
      "Very Short (<=5h)",
      "Short (6h)",
      "Recommended (7-8h)",
      "Long (9+h)"
    ].filter(c => selectedSleeps.has(c));

    const traces = cats.map(cat => {
      const xs = [];
      const ys = [];
      const ns = [];

      ageBins.forEach(ab => {
        const arr = [];
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          if (RAW.sc[i] === cat && RAW.a[i] >= ab.min && RAW.a[i] <= ab.max) {
            arr.push(RAW[activeMetric][i]);
          }
        }
        if (arr.length >= 5) {
          xs.push(ab.label);
          ys.push(Number(mean(arr).toFixed(1)));
          ns.push(arr.length);
        }
      });

      return {
        type: "scatter",
        mode: "lines+markers",
        name: cat,
        x: xs,
        y: ys,
        customdata: ns,
        line: { width: 2.6, shape: "spline", color: SLEEP_PALETTE[cat] },
        marker: { size: 7, color: SLEEP_PALETTE[cat] },
        hovertemplate:
          "<b>" + cat + "</b> (Ages %{x})<br>" +
          "Mean: %{y} kg (n = %{customdata})<extra></extra>"
      };
    });

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.7)",
      margin: { t: 28, r: 18, b: 58, l: 64 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: {
        title: { text: "Participant Age (Years, 16 to 80+)", font: { size: 12, color: "#e2e8f0" } },
        gridcolor: "rgba(148,163,184,0.10)"
      },
      yaxis: {
        title: { text: yTitle, font: { size: 12.5, color: "#e2e8f0" } },
        gridcolor: "rgba(148,163,184,0.10)"
      },
      legend: { orientation: "h", x: 0, y: 1.15, font: { size: 10.5, color: "#e2e8f0" } }
    };

    Plotly.react("plot-right-panel", traces, layout, { responsive: true, displaylogo: false });
  } else {
    const groups = [
      "Non-Hispanic Black",
      "Non-Hispanic White",
      "Mexican American",
      "Other / Multi-Racial",
      "Other Hispanic",
      "Non-Hispanic Asian"
    ];
    const sexes = ["Male", "Female"];
    const sexColors = { Male: "#38bdf8", Female: "#2dd4bf" };

    const traces = sexes.map(sx => {
      const xs = [];
      const ys = [];
      const cis = [];
      const ns = [];

      groups.forEach(g => {
        const arr = [];
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          if (RAW.s[i] === sx && RAW.r[i] === g) arr.push(RAW[activeMetric][i]);
        }
        if (arr.length >= 4) {
          const m = mean(arr);
          const ci = 1.96 * (sd(arr, m) / Math.sqrt(arr.length));
          xs.push(g.replace("Non-Hispanic ", "NH "));
          ys.push(Number(m.toFixed(1)));
          cis.push(Number(ci.toFixed(1)));
          ns.push(arr.length);
        }
      });

      return {
        type: "bar",
        name: sx,
        x: xs,
        y: ys,
        customdata: ns,
        marker: { color: sexColors[sx], opacity: 0.88 },
        error_y: { type: "data", array: cis, visible: true, color: "#e2e8f0", thickness: 1.2 },
        hovertemplate: "<b>%{x} (" + sx + ")</b><br>Mean: %{y} kg (n = %{customdata})<extra></extra>"
      };
    });

    const layout = {
      barmode: "group",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.7)",
      margin: { t: 28, r: 18, b: 78, l: 64 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: { tickangle: -22, gridcolor: "rgba(148,163,184,0.08)" },
      yaxis: {
        title: { text: yTitle, font: { size: 12.5, color: "#e2e8f0" } },
        gridcolor: "rgba(148,163,184,0.10)"
      },
      legend: { orientation: "h", x: 0, y: 1.13, font: { size: 11.5, color: "#e2e8f0" } }
    };

    Plotly.react("plot-right-panel", traces, layout, { responsive: true, displaylogo: false });
  }
}

function updateExplorer() {
  const idx = getFilteredIndices();
  updateKPIs(idx);
  renderAgeTrajectories(idx);
  renderSleepBoxes(idx);
  renderRightPanel(idx);
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", function () {
  renderHeroSurface();
  const hash = (window.location.hash || "").replace("#", "");
  if (["overview", "explorer", "story"].includes(hash)) {
    switchView(hash);
  }
});
