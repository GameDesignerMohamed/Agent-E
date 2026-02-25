// Dashboard HTML — self-contained single-page dashboard served at GET /
// Inline CSS + Chart.js CDN + WebSocket real-time updates

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentE Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg-root: #09090b;
    --bg-panel: #18181b;
    --bg-panel-hover: #1f1f23;
    --border: #27272a;
    --border-light: #3f3f46;
    --text-primary: #f4f4f5;
    --text-secondary: #a1a1aa;
    --text-muted: #71717a;
    --text-dim: #52525b;
    --accent: #22c55e;
    --accent-dim: #166534;
    --warning: #eab308;
    --warning-dim: #854d0e;
    --danger: #ef4444;
    --danger-dim: #991b1b;
    --blue: #3b82f6;
    --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-root);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    overflow-x: hidden;
  }

  /* ── Header ─────────────────────────────────────── */
  .header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-root);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    backdrop-filter: blur(8px);
  }

  .header-brand {
    font-weight: 600;
    font-size: 16px;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .header-brand span { color: var(--accent); }

  .kpi-row {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    align-items: center;
    margin-left: auto;
  }

  .kpi {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .kpi-value {
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--text-primary);
    font-size: 13px;
  }

  .kpi-value.health-good { color: var(--accent); }
  .kpi-value.health-warn { color: var(--warning); }
  .kpi-value.health-bad { color: var(--danger); }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }

  .live-dot.disconnected {
    background: var(--danger);
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* ── Layout ─────────────────────────────────────── */
  .container {
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  /* ── Charts grid ────────────────────────────────── */
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
  }

  .chart-box {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .chart-box canvas { width: 100% !important; height: 160px !important; }

  .chart-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
    margin-bottom: 8px;
  }

  .chart-value {
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  /* ── Terminal (Decision Feed) ───────────────────── */
  .terminal {
    background: var(--bg-root);
    border: 1px solid var(--border);
    border-radius: 8px;
    height: 380px;
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    padding: 12px 16px;
  }

  .terminal::-webkit-scrollbar { width: 6px; }
  .terminal::-webkit-scrollbar-track { background: transparent; }
  .terminal::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }

  .term-line {
    white-space: nowrap;
    opacity: 0;
    transform: translateY(4px);
    animation: termIn 0.3s ease-out forwards;
  }

  @keyframes termIn {
    to { opacity: 1; transform: translateY(0); }
  }

  .t-tick { color: var(--text-dim); }
  .t-ok { color: var(--accent); }
  .t-skip { color: var(--warning); }
  .t-fail { color: var(--danger); }
  .t-principle { color: var(--text-primary); font-weight: 500; }
  .t-param { color: var(--text-secondary); }
  .t-old { color: #d4d4d8; font-variant-numeric: tabular-nums; }
  .t-arrow { color: var(--text-dim); }
  .t-new { color: var(--accent); font-variant-numeric: tabular-nums; }
  .t-meta { color: var(--text-dim); }

  /* ── Alerts ─────────────────────────────────────── */
  .alerts-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }

  .alert-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    transition: opacity 0.3s, transform 0.3s;
  }

  .alert-card.fade-out {
    opacity: 0;
    transform: translateX(20px);
  }

  .alert-severity {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .sev-high { background: var(--danger-dim); color: var(--danger); }
  .sev-med { background: var(--warning-dim); color: var(--warning); }
  .sev-low { background: var(--accent-dim); color: var(--accent); }

  .alert-body { flex: 1; }
  .alert-principle { font-weight: 500; font-size: 13px; }
  .alert-reason { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }

  /* ── Violations table ──────────────────────────── */
  .violations-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .violations-table th {
    text-align: left;
    color: var(--text-muted);
    font-weight: 500;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }

  .violations-table th:hover { color: var(--text-secondary); }

  .violations-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .violations-table tr:hover td { background: var(--bg-panel-hover); }

  /* ── Split row ─────────────────────────────────── */
  .split-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 800px) {
    .split-row { grid-template-columns: 1fr; }
  }

  /* ── Persona bar chart ─────────────────────────── */
  .persona-bars { display: flex; flex-direction: column; gap: 6px; }

  .persona-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .persona-label {
    width: 100px;
    text-align: right;
    color: var(--text-secondary);
    font-size: 11px;
    flex-shrink: 0;
  }

  .persona-bar-track {
    flex: 1;
    height: 16px;
    background: var(--bg-root);
    border-radius: 3px;
    overflow: hidden;
  }

  .persona-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  .persona-pct {
    width: 40px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── Registry list ─────────────────────────────── */
  .registry-list { display: flex; flex-direction: column; gap: 4px; }

  .registry-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
  }

  .registry-item:nth-child(odd) { background: rgba(255,255,255,0.02); }
  .registry-key { color: var(--text-secondary); font-family: var(--font-mono); }
  .registry-val { color: var(--accent); font-family: var(--font-mono); font-weight: 500; }

  /* ── Advisor mode ──────────────────────────────── */
  .advisor-banner {
    display: none;
    background: var(--warning-dim);
    border: 1px solid var(--warning);
    color: var(--warning);
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    align-items: center;
    gap: 8px;
  }

  .advisor-mode .advisor-banner { display: flex; }

  .pending-pill {
    background: var(--warning);
    color: var(--bg-root);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 10px;
    font-family: var(--font-mono);
  }

  .advisor-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.15s;
  }

  .advisor-btn:hover { opacity: 0.85; }
  .advisor-btn.approve { background: var(--accent); color: var(--bg-root); }
  .advisor-btn.reject { background: var(--danger); color: #fff; }

  .advisor-actions { display: none; gap: 6px; margin-left: 8px; }
  .advisor-mode .advisor-actions { display: inline-flex; }

  /* ── Empty state ───────────────────────────────── */
  .empty-state {
    color: var(--text-dim);
    font-size: 13px;
    text-align: center;
    padding: 40px 20px;
  }

  /* ── Reduced motion ────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .term-line { animation: none; opacity: 1; transform: none; }
    .live-dot { animation: none; }
    .persona-bar-fill { transition: none; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header" id="header">
  <div class="header-brand">Agent<span>E</span> v1.6</div>
  <div class="kpi-row">
    <div class="kpi">Health <span class="kpi-value health-good" id="kpi-health">--</span></div>
    <div class="kpi">Mode <span class="kpi-value" id="kpi-mode">--</span></div>
    <div class="kpi">Tick <span class="kpi-value" id="kpi-tick">0</span></div>
    <div class="kpi">Uptime <span class="kpi-value" id="kpi-uptime">0s</span></div>
    <div class="kpi">Plans <span class="kpi-value" id="kpi-plans">0</span></div>
    <div class="live-dot" id="live-dot" title="WebSocket connected"></div>
  </div>
</div>

<div class="container" id="app">
  <!-- Advisor banner -->
  <div class="advisor-banner" id="advisor-banner">
    ADVISOR MODE — Recommendations require manual approval
    <span class="pending-pill" id="pending-count">0</span> pending
  </div>

  <!-- Charts -->
  <div class="charts-grid">
    <div class="chart-box">
      <div class="chart-label">Economy Health</div>
      <div class="chart-value" id="cv-health">--</div>
      <canvas id="chart-health"></canvas>
    </div>
    <div class="chart-box">
      <div class="chart-label">Gini Coefficient</div>
      <div class="chart-value" id="cv-gini">--</div>
      <canvas id="chart-gini"></canvas>
    </div>
    <div class="chart-box">
      <div class="chart-label">Net Flow</div>
      <div class="chart-value" id="cv-netflow">--</div>
      <canvas id="chart-netflow"></canvas>
    </div>
    <div class="chart-box">
      <div class="chart-label">Avg Satisfaction</div>
      <div class="chart-value" id="cv-satisfaction">--</div>
      <canvas id="chart-satisfaction"></canvas>
    </div>
  </div>

  <!-- Decision Feed -->
  <div class="panel">
    <div class="panel-title">Decision Feed</div>
    <div class="terminal" id="terminal"></div>
  </div>

  <!-- Active Alerts -->
  <div class="panel">
    <div class="panel-title">Active Alerts</div>
    <div class="alerts-container" id="alerts-container">
      <div class="empty-state" id="alerts-empty">No active violations</div>
    </div>
  </div>

  <!-- Violation History -->
  <div class="panel">
    <div class="panel-title">Violation History</div>
    <div style="max-height:320px;overflow-y:auto">
      <table class="violations-table" id="violations-table">
        <thead>
          <tr>
            <th data-sort="tick">Tick</th>
            <th data-sort="principle">Principle</th>
            <th data-sort="severity">Severity</th>
            <th data-sort="parameter">Parameter</th>
            <th data-sort="result">Result</th>
          </tr>
        </thead>
        <tbody id="violations-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Split: Personas + Registry -->
  <div class="split-row">
    <div class="panel">
      <div class="panel-title">Persona Distribution</div>
      <div class="persona-bars" id="persona-bars">
        <div class="empty-state">No persona data yet</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Parameter Registry</div>
      <div class="registry-list" id="registry-list">
        <div class="empty-state">No parameters registered</div>
      </div>
    </div>
  </div>
</div>

<script>
(function() {
  'use strict';

  // ── State ────────────────────────────────────────
  let ws = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT = 30000;
  let isAdvisor = false;
  let pendingDecisions = [];
  const MAX_TERMINAL_LINES = 80;
  const MAX_VIOLATIONS = 100;
  let violationSortKey = 'tick';
  let violationSortAsc = false;
  let violations = [];

  // Chart instances
  let chartHealth, chartGini, chartNetflow, chartSatisfaction;

  // ── DOM refs ─────────────────────────────────────
  const $kpiHealth = document.getElementById('kpi-health');
  const $kpiMode = document.getElementById('kpi-mode');
  const $kpiTick = document.getElementById('kpi-tick');
  const $kpiUptime = document.getElementById('kpi-uptime');
  const $kpiPlans = document.getElementById('kpi-plans');
  const $liveDot = document.getElementById('live-dot');
  const $terminal = document.getElementById('terminal');
  const $alertsContainer = document.getElementById('alerts-container');
  const $alertsEmpty = document.getElementById('alerts-empty');
  const $violationsBody = document.getElementById('violations-body');
  const $personaBars = document.getElementById('persona-bars');
  const $registryList = document.getElementById('registry-list');
  const $pendingCount = document.getElementById('pending-count');
  const $app = document.getElementById('app');

  // ── Helpers ──────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function pad(n, w) { return String(n).padStart(w || 4, ' '); }
  function fmt(n) { return typeof n === 'number' ? n.toFixed(3) : '—'; }
  function pct(n) { return typeof n === 'number' ? (n * 100).toFixed(0) + '%' : '—'; }

  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    const h = Math.floor(s / 3600);
    return h + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  function healthClass(h) {
    if (h >= 70) return 'health-good';
    if (h >= 40) return 'health-warn';
    return 'health-bad';
  }

  function sevClass(s) {
    if (s >= 7) return 'sev-high';
    if (s >= 4) return 'sev-med';
    return 'sev-low';
  }

  // ── Chart setup ──────────────────────────────────
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        ticks: { color: '#71717a', font: { family: "'JetBrains Mono'", size: 10 } },
        grid: { color: 'rgba(63,63,70,0.3)' },
        border: { display: false },
      }
    },
    elements: {
      point: { radius: 0 },
      line: { borderWidth: 1.5, tension: 0.3 },
    }
  };

  function makeChart(id, color, minY, maxY) {
    const ctx = document.getElementById(id).getContext('2d');
    const opts = JSON.parse(JSON.stringify(chartOpts));
    if (minY !== undefined) opts.scales.y.min = minY;
    if (maxY !== undefined) opts.scales.y.max = maxY;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: color,
          backgroundColor: color + '18',
          fill: true,
        }]
      },
      options: opts,
    });
  }

  function initCharts() {
    chartHealth = makeChart('chart-health', '#22c55e', 0, 100);
    chartGini = makeChart('chart-gini', '#eab308', 0, 1);
    chartNetflow = makeChart('chart-netflow', '#3b82f6');
    chartSatisfaction = makeChart('chart-satisfaction', '#22c55e', 0, 100);
  }

  function updateChart(chart, labels, data) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('none');
  }

  // ── Terminal ─────────────────────────────────────
  function addTerminalLine(html) {
    const el = document.createElement('div');
    el.className = 'term-line';
    el.innerHTML = html;
    $terminal.appendChild(el);
    while ($terminal.children.length > MAX_TERMINAL_LINES) {
      $terminal.removeChild($terminal.firstChild);
    }
    $terminal.scrollTop = $terminal.scrollHeight;
  }

  function decisionToTerminal(d) {
    const resultIcon = d.result === 'applied'
      ? '<span class="t-ok">\\u2705 </span>'
      : d.result === 'rejected'
        ? '<span class="t-fail">\\u274c </span>'
        : '<span class="t-skip">\\u23f8 </span>';

    const principle = d.diagnosis?.principle || {};
    const plan = d.plan || {};
    const severity = d.diagnosis?.violation?.severity ?? '?';
    const confidence = d.diagnosis?.violation?.confidence;
    const confStr = confidence != null ? (confidence * 100).toFixed(0) + '%' : '?';

    let advisorBtns = '';
    if (isAdvisor && d.result === 'skipped_override') {
      advisorBtns = '<span class="advisor-actions">'
        + '<button class="advisor-btn approve" onclick="window._approve(\\'' + esc(d.id) + '\\')">[Approve]</button>'
        + '<button class="advisor-btn reject" onclick="window._reject(\\'' + esc(d.id) + '\\')">[Reject]</button>'
        + '</span>';
    }

    return '<span class="t-tick">[Tick ' + pad(d.tick) + ']</span> '
      + resultIcon
      + '<span class="t-principle">[' + esc(principle.id || '?') + '] ' + esc(principle.name || '') + ':</span> '
      + '<span class="t-param">' + esc(plan.parameter || '—') + ' </span>'
      + '<span class="t-old">' + fmt(plan.currentValue) + '</span>'
      + '<span class="t-arrow"> \\u2192 </span>'
      + '<span class="t-new">' + fmt(plan.targetValue) + '</span>'
      + '<span class="t-meta">  severity ' + severity + '/10, confidence ' + confStr + '</span>'
      + advisorBtns;
  }

  // ── Alerts ───────────────────────────────────────
  function renderAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      $alertsContainer.innerHTML = '<div class="empty-state">No active violations</div>';
      return;
    }
    const sorted = [...alerts].sort((a, b) => (b.severity || 0) - (a.severity || 0));
    $alertsContainer.innerHTML = sorted.map(function(a) {
      const sev = a.severity || a.violation?.severity || 0;
      const sc = sevClass(sev);
      const name = a.principleName || a.principle?.name || '?';
      const pid = a.principleId || a.principle?.id || '?';
      const reason = a.reasoning || a.violation?.suggestedAction?.reasoning || '';
      return '<div class="alert-card">'
        + '<span class="alert-severity ' + sc + '">' + sev + '/10</span>'
        + '<div class="alert-body">'
        + '<div class="alert-principle">[' + esc(pid) + '] ' + esc(name) + '</div>'
        + '<div class="alert-reason">' + esc(reason) + '</div>'
        + '</div></div>';
    }).join('');
  }

  // ── Violations table ─────────────────────────────
  function addViolation(d) {
    violations.push({
      tick: d.tick,
      principle: (d.diagnosis?.principle?.id || '?') + ' ' + (d.diagnosis?.principle?.name || ''),
      severity: d.diagnosis?.violation?.severity || 0,
      parameter: d.plan?.parameter || '—',
      result: d.result,
    });
    if (violations.length > MAX_VIOLATIONS) violations.shift();
    renderViolations();
  }

  function renderViolations() {
    const sorted = [...violations].sort(function(a, b) {
      const va = a[violationSortKey], vb = b[violationSortKey];
      if (va < vb) return violationSortAsc ? -1 : 1;
      if (va > vb) return violationSortAsc ? 1 : -1;
      return 0;
    });
    $violationsBody.innerHTML = sorted.map(function(v) {
      return '<tr>'
        + '<td>' + v.tick + '</td>'
        + '<td style="color:var(--text-primary);font-family:var(--font-sans)">' + esc(v.principle) + '</td>'
        + '<td><span class="alert-severity ' + sevClass(v.severity) + '">' + v.severity + '</span></td>'
        + '<td>' + esc(v.parameter) + '</td>'
        + '<td>' + esc(v.result) + '</td>'
        + '</tr>';
    }).join('');
  }

  // Table sorting
  document.querySelectorAll('.violations-table th').forEach(function(th) {
    th.addEventListener('click', function() {
      const key = th.dataset.sort;
      if (violationSortKey === key) violationSortAsc = !violationSortAsc;
      else { violationSortKey = key; violationSortAsc = true; }
      renderViolations();
    });
  });

  // ── Personas ─────────────────────────────────────
  function renderPersonas(dist) {
    if (!dist || Object.keys(dist).length === 0) {
      $personaBars.innerHTML = '<div class="empty-state">No persona data yet</div>';
      return;
    }
    const total = Object.values(dist).reduce(function(s, v) { return s + v; }, 0);
    const entries = Object.entries(dist).sort(function(a, b) { return b[1] - a[1]; });
    $personaBars.innerHTML = entries.map(function(e) {
      const pctVal = total > 0 ? (e[1] / total * 100) : 0;
      return '<div class="persona-row">'
        + '<div class="persona-label">' + esc(e[0]) + '</div>'
        + '<div class="persona-bar-track"><div class="persona-bar-fill" style="width:' + pctVal + '%"></div></div>'
        + '<div class="persona-pct">' + pctVal.toFixed(0) + '%</div>'
        + '</div>';
    }).join('');
  }

  // ── Registry ─────────────────────────────────────
  function renderRegistry(principles) {
    if (!principles || principles.length === 0) {
      $registryList.innerHTML = '<div class="empty-state">No parameters registered</div>';
      return;
    }
    $registryList.innerHTML = principles.slice(0, 30).map(function(p) {
      return '<div class="registry-item">'
        + '<span class="registry-key">[' + esc(p.id) + ']</span>'
        + '<span class="registry-val">' + esc(p.name) + '</span>'
        + '</div>';
    }).join('');
  }

  // ── KPI update ───────────────────────────────────
  function updateKPIs(data) {
    if (data.health != null) {
      $kpiHealth.textContent = data.health + '/100';
      $kpiHealth.className = 'kpi-value ' + healthClass(data.health);
      document.getElementById('cv-health').textContent = data.health + '/100';
    }
    if (data.mode != null) {
      $kpiMode.textContent = data.mode;
      isAdvisor = data.mode === 'advisor';
      $app.classList.toggle('advisor-mode', isAdvisor);
    }
    if (data.tick != null) $kpiTick.textContent = data.tick;
    if (data.uptime != null) $kpiUptime.textContent = formatUptime(data.uptime);
    if (data.activePlans != null) $kpiPlans.textContent = data.activePlans;
  }

  // ── Metrics history ──────────────────────────────
  function updateChartsFromHistory(history) {
    if (!history || history.length === 0) return;
    const ticks = history.map(function(h) { return h.tick; });
    updateChart(chartHealth, ticks, history.map(function(h) { return h.health; }));
    updateChart(chartGini, ticks, history.map(function(h) { return h.giniCoefficient; }));
    updateChart(chartNetflow, ticks, history.map(function(h) { return h.netFlow; }));
    updateChart(chartSatisfaction, ticks, history.map(function(h) { return h.avgSatisfaction; }));

    const last = history[history.length - 1];
    document.getElementById('cv-gini').textContent = last.giniCoefficient.toFixed(3);
    document.getElementById('cv-netflow').textContent = last.netFlow.toFixed(1);
    document.getElementById('cv-satisfaction').textContent = last.avgSatisfaction.toFixed(0) + '/100';
  }

  // ── API calls ────────────────────────────────────
  function fetchJSON(path) {
    return fetch(path).then(function(r) { return r.json(); });
  }

  function postJSON(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.json(); });
  }

  function loadInitialData() {
    fetchJSON('/health').then(function(data) {
      updateKPIs(data);
    }).catch(function() {});

    fetchJSON('/decisions?limit=50').then(function(data) {
      if (data.decisions) {
        data.decisions.reverse().forEach(function(d) {
          addTerminalLine(decisionToTerminal(d));
          addViolation(d);
        });
      }
    }).catch(function() {});

    fetchJSON('/metrics').then(function(data) {
      if (data.history) updateChartsFromHistory(data.history);
      if (data.latest) {
        renderPersonas(data.latest.personaDistribution);
      }
    }).catch(function() {});

    fetchJSON('/principles').then(function(data) {
      if (data.principles) renderRegistry(data.principles);
    }).catch(function() {});

    fetchJSON('/pending').then(function(data) {
      if (data.pending) {
        pendingDecisions = data.pending;
        $pendingCount.textContent = data.count || 0;
      }
    }).catch(function() {});
  }

  // ── Polling fallback ─────────────────────────────
  let pollInterval = null;

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(function() {
      fetchJSON('/health').then(updateKPIs).catch(function() {});
      fetchJSON('/metrics').then(function(data) {
        if (data.history) updateChartsFromHistory(data.history);
        if (data.latest) renderPersonas(data.latest.personaDistribution);
      }).catch(function() {});
    }, 5000);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // ── WebSocket ────────────────────────────────────
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);

    ws.onopen = function() {
      reconnectDelay = 1000;
      $liveDot.classList.remove('disconnected');
      $liveDot.title = 'WebSocket connected';
      stopPolling();
      // Request fresh health
      ws.send(JSON.stringify({ type: 'health' }));
    };

    ws.onclose = function() {
      $liveDot.classList.add('disconnected');
      $liveDot.title = 'WebSocket disconnected — reconnecting...';
      startPolling();
      setTimeout(connectWS, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT);
    };

    ws.onerror = function() { ws.close(); };

    ws.onmessage = function(ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch(e) { return; }

      switch (msg.type) {
        case 'tick_result':
          updateKPIs({ health: msg.health, tick: msg.tick });
          if (msg.alerts) renderAlerts(msg.alerts);
          // Refresh charts
          fetchJSON('/metrics').then(function(data) {
            if (data.history) updateChartsFromHistory(data.history);
            if (data.latest) renderPersonas(data.latest.personaDistribution);
          }).catch(function() {});
          break;

        case 'health_result':
          updateKPIs(msg);
          break;

        case 'advisor_action':
          if (msg.action === 'approved' || msg.action === 'rejected') {
            pendingDecisions = pendingDecisions.filter(function(d) {
              return d.id !== msg.decisionId;
            });
            $pendingCount.textContent = pendingDecisions.length;
          }
          break;
      }
    };
  }

  // ── Advisor actions ──────────────────────────────
  window._approve = function(id) {
    postJSON('/approve', { decisionId: id }).then(function(data) {
      if (data.ok) {
        addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-ok">\\u2705 Approved ' + id + '</span>');
      }
    }).catch(function() {});
  };

  window._reject = function(id) {
    var reason = prompt('Rejection reason (optional):');
    postJSON('/reject', { decisionId: id, reason: reason || undefined }).then(function(data) {
      if (data.ok) {
        addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-fail">\\u274c Rejected ' + id + '</span>');
      }
    }).catch(function() {});
  };

  // ── Init ─────────────────────────────────────────
  initCharts();
  loadInitialData();
  connectWS();

})();
</script>
</body>
</html>`;
}
