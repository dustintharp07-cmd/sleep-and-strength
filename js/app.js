/* ==========================================================================
   Sleep & Strength — Interactive Explorer & Legacy SPA Logic (js/app.js)
   - Sex-separated distributions and trajectories by default
   - Discrete means + 95% confidence intervals (no unbanded spline curves)
   - Minimum cell threshold (n >= 10) for reliable subgroup interval display
   - Transparent sample-size and missingness accounting
   ========================================================================== */

let activeMetric = "cg";
let activeWeightMode = "unw"; // "unw" or "wtd"
let rightPanelMode = "lifespan";

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
  "45-59": "#fbbf24",
  "60-74": "#a78bfa",
  "75-80+": "#f472b6"
};

const SLEEP_SHORT = {
  "Very Short (<=5h)": "≤5h Very Short",
  "Short (6h)": "6h Short",
  "Recommended (7-8h)": "7–8h Rec.",
  "Long (9+h)": "9+h Long"
};

/* ---------- Statistical Helpers ---------- */
function meanUnw(arr) {
  if (!arr.length) return NaN;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function sdUnw(arr, m) {
  if (arr.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

function meanWtdAndSE(vals, wts) {
  const n = vals.length;
  if (!n) return { mean: NaN, se: NaN };
  let sumW = 0;
  let sumWY = 0;
  for (let i = 0; i < n; i++) {
    sumW += wts[i];
    sumWY += wts[i] * vals[i];
  }
  const mu = sumWY / sumW;
  if (n < 2) return { mean: mu, se: 0 };
  // Kish effective-sample-size Taylor approximation for fast interactive explorer slices
  let sumW2 = 0;
  let numVar = 0;
  for (let i = 0; i < n; i++) {
    sumW2 += wts[i] * wts[i];
    const diff = vals[i] - mu;
    numVar += wts[i] * diff * diff;
  }
  const s2 = numVar / sumW;
  const nEff = (sumW * sumW) / sumW2;
  const se = nEff > 1 ? Math.sqrt(s2 / (nEff - 1)) : 0;
  return { mean: mu, se: se };
}

function summarizeGroup(indices) {
  const n = indices.length;
  if (n === 0) return { n: 0, mean: NaN, ci: NaN, med: NaN, q25: NaN, q75: NaN };
  const vals = indices.map(i => RAW[activeMetric][i]);
  const sorted = vals.slice().sort((a, b) => a - b);
  const qAt = q => {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  };

  if (activeWeightMode === "wtd" && RAW.w) {
    const wts = indices.map(i => RAW.w[i]);
    const wm = meanWtdAndSE(vals, wts);
    return {
      n: n,
      mean: wm.mean,
      ci: 1.96 * wm.se,
      med: qAt(0.5),
      q25: qAt(0.25),
      q75: qAt(0.75)
    };
  }

  const m = meanUnw(vals);
  const s = sdUnw(vals, m);
  return {
    n: n,
    mean: m,
    ci: n > 1 ? 1.96 * (s / Math.sqrt(n)) : 0,
    med: qAt(0.5),
    q25: qAt(0.25),
    q75: qAt(0.75)
  };
}

function sleepBinLabel(h) {
  if (h <= 4) return "≤4h";
  if (h >= 10) return "10+h";
  return h + "h";
}

/* ---------- Explorer Controls ---------- */
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
  const cgBtn = document.getElementById("metric-cg");
  const mgBtn = document.getElementById("metric-mg");
  if (cgBtn) cgBtn.classList.toggle("active", m === "cg");
  if (mgBtn) mgBtn.classList.toggle("active", m === "mg");
  updateExplorer();
}

function setWeightMode(wm) {
  activeWeightMode = wm;
  const uBtn = document.getElementById("wmode-unw");
  const wBtn = document.getElementById("wmode-wtd");
  if (uBtn) uBtn.classList.toggle("active", wm === "unw");
  if (wBtn) wBtn.classList.toggle("active", wm === "wtd");
  const badge = document.getElementById("explorer-method-badge");
  if (badge) {
    if (wm === "unw") {
      badge.className = "method-badge badge-descriptive";
      badge.textContent = "Unweighted Sample Cross-Filtering (Exact Subgroup n & 95% CI)";
    } else {
      badge.className = "method-badge badge-weighted";
      badge.textContent = "MEC-Weighted Subgroup Means (Effective-n 95% CI; Boxplots Remain Sample Quantiles)";
    }
  }
  updateExplorer();
}

function setRightPanel(mode) {
  rightPanelMode = mode;
  const lBtn = document.getElementById("subview-lifespan");
  const dBtn = document.getElementById("subview-demo");
  if (lBtn) lBtn.classList.toggle("active", mode === "lifespan");
  if (dBtn) dBtn.classList.toggle("active", mode === "demo");

  const titleEl = document.getElementById("right-panel-title");
  const descEl = document.getElementById("right-panel-desc");
  if (titleEl && descEl) {
    if (mode === "lifespan") {
      titleEl.textContent = "Aging Drives Steep Strength Decline Across Every Sleep Category";
      descEl.textContent = "Discrete life-stage means (±95% CI, n >= 10) separated by biological sex—without misleading spline smoothing.";
    } else {
      titleEl.textContent = "Grip Strength Varies Across Demographic Subgroups Within Each Sex";
      descEl.textContent = "Subgroup means (±95% CI, n >= 10) across NHANES RIDRETH3 categories separated by Male and Female.";
    }
  }
  updateExplorer();
}

function resetAllFilters() {
  ["16-29", "30-44", "45-59", "60-74", "75-80+"].forEach(v => selectedAges.add(v));
  ["Very Short (<=5h)", "Short (6h)", "Recommended (7-8h)", "Long (9+h)"].forEach(v =>
    selectedSleeps.add(v)
  );
  document.querySelectorAll(".chip-toggle").forEach(el => el.classList.add("selected"));
  const sexSel = document.getElementById("sex-select");
  const raceSel = document.getElementById("race-select");
  const tsSel = document.getElementById("trouble-select");
  const sdSel = document.getElementById("disorder-select");
  if (sexSel) sexSel.value = "ALL";
  if (raceSel) raceSel.value = "ALL";
  if (tsSel) tsSel.value = "ALL";
  if (sdSel) sdSel.value = "ALL";
  activeMetric = "cg";
  const cgBtn = document.getElementById("metric-cg");
  const mgBtn = document.getElementById("metric-mg");
  if (cgBtn) cgBtn.classList.add("active");
  if (mgBtn) mgBtn.classList.remove("active");
  setWeightMode("unw");
}

function getFilteredIndices() {
  const totalN = RAW.a.length;
  const sexVal = document.getElementById("sex-select")?.value || "ALL";
  const raceVal = document.getElementById("race-select")?.value || "ALL";
  const troubleVal = document.getElementById("trouble-select")?.value || "ALL";
  const disorderVal = document.getElementById("disorder-select")?.value || "ALL";
  const idx = [];
  let excludedMissing = 0;

  for (let i = 0; i < totalN; i++) {
    if (!selectedAges.has(RAW.ag[i])) continue;
    if (!selectedSleeps.has(RAW.sc[i])) continue;
    if (sexVal !== "ALL" && RAW.s[i] !== sexVal) continue;
    if (raceVal !== "ALL" && RAW.r[i] !== raceVal) continue;

    if (troubleVal !== "ALL") {
      if (RAW.ts[i] === "Missing") {
        excludedMissing++;
        continue;
      }
      if (RAW.ts[i] !== troubleVal) continue;
    }
    if (disorderVal !== "ALL") {
      if (RAW.sd && RAW.sd[i] === "Missing") {
        excludedMissing++;
        continue;
      }
      if (RAW.sd && RAW.sd[i] !== disorderVal) continue;
    }

    const val = RAW[activeMetric][i];
    if (val === null || isNaN(val)) continue;
    idx.push(i);
  }
  return { idx: idx, excludedMissing: excludedMissing };
}

function updateKPIs(idx, excludedMissing) {
  const totalN = RAW.a.length;
  const n = idx.length;
  const metricName = activeMetric === "cg" ? "Combined Grip" : "Single-Hand Peak";
  const sexVal = document.getElementById("sex-select")?.value || "ALL";

  document.getElementById("kpi-n").textContent = n.toLocaleString();
  const pctStr = ((n / totalN) * 100).toFixed(1) + "% of N = " + totalN.toLocaleString();
  document.getElementById("kpi-n-pct").textContent =
    excludedMissing > 0 ? pctStr + " (" + excludedMissing + " missing excluded)" : pctStr;

  const sampleBadge = document.getElementById("explorer-sample-badge");
  if (sampleBadge) {
    const mCount = idx.filter(i => RAW.s[i] === "Male").length;
    const fCount = idx.filter(i => RAW.s[i] === "Female").length;
    sampleBadge.textContent =
      "Active Slice: n = " +
      n.toLocaleString() +
      " (" +
      mCount.toLocaleString() +
      "M · " +
      fCount.toLocaleString() +
      "F)";
  }

  if (n === 0) {
    document.getElementById("kpi-mean").textContent = "—";
    document.getElementById("kpi-sd").textContent = "No matching observations";
    document.getElementById("kpi-median").textContent = "—";
    document.getElementById("kpi-iqr").textContent = "Broaden filters above";
    document.getElementById("kpi-gap").textContent = "—";
    return;
  }

  const mIdx = idx.filter(i => RAW.s[i] === "Male");
  const fIdx = idx.filter(i => RAW.s[i] === "Female");

  document.getElementById("kpi-mean-label").textContent =
    (activeWeightMode === "wtd" ? "MEC-Weighted Mean " : "Sample Mean ") + metricName;

  if (sexVal === "ALL" && mIdx.length > 0 && fIdx.length > 0) {
    const mStat = summarizeGroup(mIdx);
    const fStat = summarizeGroup(fIdx);
    document.getElementById("kpi-mean").textContent =
      mStat.mean.toFixed(1) + " / " + fStat.mean.toFixed(1) + " kg";
    document.getElementById("kpi-sd").textContent =
      "Male (n=" + mStat.n.toLocaleString() + ") / Female (n=" + fStat.n.toLocaleString() + ")";
    document.getElementById("kpi-median").textContent =
      mStat.med.toFixed(1) + " / " + fStat.med.toFixed(1) + " kg";
    document.getElementById("kpi-iqr").textContent = "Sex-separated sample medians (M / F)";
  } else {
    const st = summarizeGroup(idx);
    document.getElementById("kpi-mean").textContent = st.mean.toFixed(1) + " kg";
    document.getElementById("kpi-sd").textContent = "±" + st.ci.toFixed(1) + " kg (95% CI)";
    document.getElementById("kpi-median").textContent = st.med.toFixed(1) + " kg";
    document.getElementById("kpi-iqr").textContent =
      "Sample IQR: " + st.q25.toFixed(1) + " – " + st.q75.toFixed(1) + " kg";
  }

  // Sex-aware 7-8h vs 9+h difference
  const computeGapForSex = subIdx => {
    const rec = subIdx.filter(i => RAW.sc[i] === "Recommended (7-8h)");
    const lng = subIdx.filter(i => RAW.sc[i] === "Long (9+h)");
    if (rec.length < 10 || lng.length < 10) return null;
    return summarizeGroup(lng).mean - summarizeGroup(rec).mean;
  };

  if (sexVal === "ALL") {
    const gM = computeGapForSex(mIdx);
    const gF = computeGapForSex(fIdx);
    if (gM !== null && gF !== null) {
      const fmt = v => (v >= 0 ? "+" : "") + v.toFixed(1);
      document.getElementById("kpi-gap").textContent = fmt(gM) + " / " + fmt(gF) + " kg";
      document.getElementById("kpi-gap-sub").textContent = "9+h minus 7–8h (Male / Female)";
    } else {
      document.getElementById("kpi-gap").textContent = "Low n / N/A";
      document.getElementById("kpi-gap-sub").textContent = "Requires n >= 10 in both 7–8h & 9+h";
    }
  } else {
    const g = computeGapForSex(idx);
    if (g !== null) {
      document.getElementById("kpi-gap").textContent = (g >= 0 ? "+" : "") + g.toFixed(1) + " kg";
      document.getElementById("kpi-gap-sub").textContent = "9+h minus 7–8h (" + sexVal + ")";
    } else {
      document.getElementById("kpi-gap").textContent = "Low n / N/A";
      document.getElementById("kpi-gap-sub").textContent = "Requires n >= 10 in both 7–8h & 9+h";
    }
  }
}

function buildAgeTrajectoryTraces(subIdx, sexLabel, axisSuffix, showLeg) {
  const bins = ["≤4h", "5h", "6h", "7h", "8h", "9h", "10+h"];
  const ageGroups = ["16-29", "30-44", "45-59", "60-74", "75-80+"].filter(g => selectedAges.has(g));
  const offsets = [-0.16, -0.08, 0, 0.08, 0.16];
  const traces = [];

  ageGroups.forEach((ag, aIdx) => {
    const bucket = {};
    bins.forEach(b => (bucket[b] = []));

    for (let k = 0; k < subIdx.length; k++) {
      const i = subIdx[k];
      if (RAW.ag[i] !== ag) continue;
      bucket[sleepBinLabel(RAW.sh[i])].push(i);
    }

    const xs = [];
    const ys = [];
    const cis = [];
    const cdata = [];

    bins.forEach((b, bIdx) => {
      const cellIdx = bucket[b];
      if (cellIdx.length >= 10) {
        const st = summarizeGroup(cellIdx);
        xs.push(bIdx + offsets[aIdx % offsets.length]);
        ys.push(Number(st.mean.toFixed(1)));
        cis.push(Number(st.ci.toFixed(1)));
        cdata.push([b, st.n]);
      }
    });

    traces.push({
      type: "scatter",
      mode: "markers",
      name: "Ages " + ag,
      legendgroup: ag,
      showlegend: showLeg,
      xaxis: "x" + axisSuffix,
      yaxis: "y" + axisSuffix,
      x: xs,
      y: ys,
      customdata: cdata,
      error_y: {
        type: "data",
        array: cis,
        visible: true,
        thickness: 1.8,
        width: 4,
        color: AGE_PALETTE[ag]
      },
      marker: {
        size: 8.5,
        color: AGE_PALETTE[ag],
        line: { color: "#050811", width: 1.4 }
      },
      hovertemplate:
        "<b>" + sexLabel + " &middot; Ages " + ag + " &middot; %{customdata[0]} Sleep</b><br>" +
        "Mean Strength: <b>%{y:.1f} kg</b> (&plusmn;%{error_y.array} kg 95% CI)<br>" +
        "Cell Sample Size: n = %{customdata[1]}<extra></extra>"
    });
  });

  return traces;
}

function renderAgeTrajectories(idx) {
  const bins = ["≤4h", "5h", "6h", "7h", "8h", "9h", "10+h"];
  const sexVal = document.getElementById("sex-select")?.value || "ALL";
  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Peak Single-Hand Grip (kg)";

  if (sexVal === "ALL") {
    const mIdx = idx.filter(i => RAW.s[i] === "Male");
    const fIdx = idx.filter(i => RAW.s[i] === "Female");
    const mTraces = buildAgeTrajectoryTraces(mIdx, "Male", "", true);
    const fTraces = buildAgeTrajectoryTraces(fIdx, "Female", "2", false);

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.72)",
      margin: { t: 52, r: 22, b: 64, l: 66 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: {
        domain: [0, 0.47],
        range: [-0.55, 6.55],
        tickvals: [0, 1, 2, 3, 4, 5, 6],
        ticktext: bins,
        title: { text: "Nightly Sleep Hours (Males, cells n >= 10)", font: { size: 12, color: "#cbd5e1" } },
        gridcolor: "rgba(148,163,184,0.10)",
        zeroline: false
      },
      yaxis: {
        title: { text: yTitle, font: { size: 13, color: "#f8fafc" } },
        gridcolor: "rgba(148,163,184,0.12)"
      },
      xaxis2: {
        domain: [0.53, 1.0],
        anchor: "y2",
        range: [-0.55, 6.55],
        tickvals: [0, 1, 2, 3, 4, 5, 6],
        ticktext: bins,
        title: { text: "Nightly Sleep Hours (Females, cells n >= 10)", font: { size: 12, color: "#cbd5e1" } },
        gridcolor: "rgba(148,163,184,0.10)",
        zeroline: false
      },
      yaxis2: {
        anchor: "x2",
        matches: "y",
        tickfont: { color: "#94a3b8" },
        gridcolor: "rgba(148,163,184,0.12)"
      },
      annotations: [
        {
          xref: "paper", yref: "paper", x: 0.235, y: 1.07,
          xanchor: "center", yanchor: "bottom", showarrow: false,
          text: "<b style='color:#7dd3fc;font-size:13px'>MALES (n = " + mIdx.length.toLocaleString() + ")</b>"
        },
        {
          xref: "paper", yref: "paper", x: 0.765, y: 1.07,
          xanchor: "center", yanchor: "bottom", showarrow: false,
          text: "<b style='color:#f9a8d4;font-size:13px'>FEMALES (n = " + fIdx.length.toLocaleString() + ")</b>"
        }
      ],
      legend: { orientation: "h", x: 0, y: -0.17, font: { color: "#e2e8f0", size: 12 } }
    };

    Plotly.react("plot-age-trajectories", mTraces.concat(fTraces), layout, {
      responsive: true,
      displaylogo: false
    });
  } else {
    const traces = buildAgeTrajectoryTraces(idx, sexVal, "", true);
    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.72)",
      margin: { t: 32, r: 24, b: 64, l: 68 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: {
        range: [-0.55, 6.55],
        tickvals: [0, 1, 2, 3, 4, 5, 6],
        ticktext: bins,
        title: { text: "Nightly Sleep Hours (" + sexVal + ", cells n >= 10)", font: { size: 12.5, color: "#cbd5e1" } },
        gridcolor: "rgba(148,163,184,0.10)",
        zeroline: false
      },
      yaxis: {
        title: { text: yTitle, font: { size: 13, color: "#f8fafc" } },
        gridcolor: "rgba(148,163,184,0.12)"
      },
      legend: { orientation: "h", x: 0, y: 1.11, font: { color: "#e2e8f0", size: 12 } }
    };

    Plotly.react("plot-age-trajectories", traces, layout, { responsive: true, displaylogo: false });
  }
}

function renderSleepBoxes(idx) {
  const cats = [
    "Very Short (<=5h)",
    "Short (6h)",
    "Recommended (7-8h)",
    "Long (9+h)"
  ].filter(c => selectedSleeps.has(c));

  const sexVal = document.getElementById("sex-select")?.value || "ALL";
  const sexes = sexVal === "ALL" ? ["Male", "Female"] : [sexVal];
  const sexColors = { Male: "#38bdf8", Female: "#f472b6" };
  const sexFills = { Male: "rgba(56, 189, 248, 0.20)", Female: "rgba(244, 114, 182, 0.20)" };

  const traces = sexes.map(sx => {
    const xs = [];
    const ys = [];

    cats.forEach(cat => {
      const label = SLEEP_SHORT[cat];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        if (RAW.s[i] === sx && RAW.sc[i] === cat) {
          xs.push(label);
          ys.push(RAW[activeMetric][i]);
        }
      }
    });

    return {
      type: "box",
      name: sx + " (n = " + ys.length.toLocaleString() + ")",
      x: xs,
      y: ys,
      boxmean: true,
      boxpoints: false,
      marker: { color: sexColors[sx] },
      line: { color: sexColors[sx], width: 2 },
      fillcolor: sexFills[sx]
    };
  });

  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Peak Single-Hand Grip (kg)";
  const layout = {
    boxmode: sexes.length > 1 ? "group" : "overlay",
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8,13,26,0.72)",
    margin: { t: 28, r: 18, b: 58, l: 64 },
    showlegend: true,
    legend: { orientation: "h", x: 0, y: 1.13, font: { size: 11.5, color: "#e2e8f0" } },
    font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
    xaxis: { tickfont: { size: 11.5, color: "#f8fafc" }, gridcolor: "rgba(148,163,184,0.08)" },
    yaxis: {
      title: { text: yTitle, font: { size: 12.5, color: "#f8fafc" } },
      gridcolor: "rgba(148,163,184,0.12)"
    }
  };

  Plotly.react("plot-sleep-boxes", traces, layout, { responsive: true, displaylogo: false });
}

function renderRightPanel(idx) {
  const yTitle = activeMetric === "cg" ? "Combined Grip Strength (kg)" : "Peak Single-Hand Grip (kg)";
  const sexVal = document.getElementById("sex-select")?.value || "ALL";
  const sexes = sexVal === "ALL" ? ["Male", "Female"] : [sexVal];

  if (rightPanelMode === "lifespan") {
    const stages = ["16-29", "30-44", "45-59", "60-74", "75-80+"].filter(g => selectedAges.has(g));
    const cats = [
      "Very Short (<=5h)",
      "Short (6h)",
      "Recommended (7-8h)",
      "Long (9+h)"
    ].filter(c => selectedSleeps.has(c));

    const catPalette = {
      "Very Short (<=5h)": "#38bdf8",
      "Short (6h)": "#2dd4bf",
      "Recommended (7-8h)": "#f8fafc",
      "Long (9+h)": "#a78bfa"
    };
    const offsets = [-0.15, -0.05, 0.05, 0.15];
    const traces = [];

    sexes.forEach(sx => {
      cats.forEach((cat, cIdx) => {
        const xs = [];
        const ys = [];
        const cis = [];
        const cdata = [];

        stages.forEach((stName, sIdx) => {
          const cellIdx = [];
          for (let k = 0; k < idx.length; k++) {
            const i = idx[k];
            if (RAW.s[i] === sx && RAW.sc[i] === cat && RAW.ag[i] === stName) {
              cellIdx.push(i);
            }
          }
          if (cellIdx.length >= 10) {
            const st = summarizeGroup(cellIdx);
            xs.push(sIdx + offsets[cIdx % offsets.length]);
            ys.push(Number(st.mean.toFixed(1)));
            cis.push(Number(st.ci.toFixed(1)));
            cdata.push([stName, st.n]);
          }
        });

        if (xs.length > 0) {
          traces.push({
            type: "scatter",
            mode: "markers",
            name: (sexes.length > 1 ? sx[0] + " · " : "") + SLEEP_SHORT[cat],
            x: xs,
            y: ys,
            customdata: cdata,
            marker: {
              size: 8.5,
              symbol: sx === "Male" ? "circle" : "diamond",
              color: catPalette[cat],
              line: { color: sx === "Male" ? "#38bdf8" : "#f472b6", width: 1.8 }
            },
            error_y: {
              type: "data",
              array: cis,
              visible: true,
              color: catPalette[cat],
              thickness: 1.7,
              width: 4
            },
            hovertemplate:
              "<b>" + sx + " &middot; " + SLEEP_SHORT[cat] + " (Ages %{customdata[0]})</b><br>" +
              "Mean: <b>%{y:.1f} kg</b> (&plusmn;%{error_y.array} kg 95% CI)<br>" +
              "Cell Count: n = %{customdata[1]}<extra></extra>"
          });
        }
      });
    });

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.72)",
      margin: { t: 36, r: 18, b: 58, l: 64 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: {
        tickvals: stages.map((_, i) => i),
        ticktext: stages.map(s => "Ages " + s),
        title: { text: "Lifespan Age Group (Discrete Means ± 95% CI, n >= 10)", font: { size: 12, color: "#cbd5e1" } },
        gridcolor: "rgba(148,163,184,0.10)",
        zeroline: false
      },
      yaxis: {
        title: { text: yTitle, font: { size: 12.5, color: "#f8fafc" } },
        gridcolor: "rgba(148,163,184,0.12)"
      },
      legend: { orientation: "h", x: 0, y: 1.18, font: { size: 10.2, color: "#e2e8f0" } }
    };

    Plotly.react("plot-right-panel", traces, layout, { responsive: true, displaylogo: false });
  } else {
    const groups = [
      "Non-Hispanic Black",
      "Other / Multi-Racial",
      "Non-Hispanic White",
      "Mexican American",
      "Other Hispanic",
      "Non-Hispanic Asian"
    ];
    const sexColors = { Male: "#38bdf8", Female: "#f472b6" };

    const traces = sexes.map(sx => {
      const xs = [];
      const ys = [];
      const cis = [];
      const ns = [];

      groups.forEach(g => {
        const cellIdx = [];
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          if (RAW.s[i] === sx && RAW.r[i] === g) cellIdx.push(i);
        }
        if (cellIdx.length >= 10) {
          const st = summarizeGroup(cellIdx);
          xs.push(g.replace("Non-Hispanic ", "NH "));
          ys.push(Number(st.mean.toFixed(1)));
          cis.push(Number(st.ci.toFixed(1)));
          ns.push(st.n);
        }
      });

      return {
        type: "bar",
        name: sx,
        x: xs,
        y: ys,
        customdata: ns,
        marker: { color: sexColors[sx], opacity: 0.88 },
        error_y: { type: "data", array: cis, visible: true, color: "#f8fafc", thickness: 1.4, width: 4 },
        hovertemplate: "<b>%{x} (" + sx + ")</b><br>Mean: <b>%{y:.1f} kg</b> (&plusmn;%{error_y.array} kg 95% CI)<br>n = %{customdata}<extra></extra>"
      };
    });

    const layout = {
      barmode: "group",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(8,13,26,0.72)",
      margin: { t: 28, r: 18, b: 74, l: 64 },
      font: { family: "Inter, system-ui, sans-serif", color: "#cbd5e1" },
      xaxis: { tickangle: -20, tickfont: { color: "#f8fafc" }, gridcolor: "rgba(148,163,184,0.08)" },
      yaxis: {
        title: { text: yTitle, font: { size: 12.5, color: "#f8fafc" } },
        gridcolor: "rgba(148,163,184,0.12)"
      },
      legend: { orientation: "h", x: 0, y: 1.13, font: { size: 11.5, color: "#e2e8f0" } }
    };

    Plotly.react("plot-right-panel", traces, layout, { responsive: true, displaylogo: false });
  }
}

function updateExplorer() {
  if (typeof RAW === "undefined" || !document.getElementById("plot-age-trajectories")) return;
  const res = getFilteredIndices();
  updateKPIs(res.idx, res.excludedMissing);
  renderAgeTrajectories(res.idx);
  renderSleepBoxes(res.idx);
  renderRightPanel(res.idx);
}

document.addEventListener("DOMContentLoaded", function () {
  if (document.getElementById("plot-age-trajectories")) {
    updateExplorer();
  }
});
