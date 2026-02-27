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
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg-root: #09090b;
    --bg-panel: #18181b;
    --bg-terminal: #09090b;
    --border: #27272a;
    --text-primary: #ffffff;
    --text-secondary: #52525b;
    --text-tertiary: #a1a1aa;
    --text-value: #d4d4d8;
    --accent: #22c55e;
    --warning: #eab308;
    --danger: #ef4444;
    --info: #71717a;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg-root);
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
    min-height: 100dvh;
    overflow-y: auto;
  }

  /* -- Header -- */
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .header-version {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-root);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .kpi-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
  }

  .kpi-pill .label {
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .kpi-pill .value {
    color: var(--text-value);
    font-variant-numeric: tabular-nums;
  }

  .kpi-pill .value.health-good { color: var(--accent); }
  .kpi-pill .value.health-warn { color: var(--warning); }
  .kpi-pill .value.health-bad { color: var(--danger); }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
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

  /* -- Advisor Banner -- */
  .advisor-banner {
    display: none;
    background: rgba(234,179,8,0.08);
    border-bottom: 1px solid rgba(234,179,8,0.2);
    padding: 8px 24px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--warning);
    text-align: center;
    letter-spacing: 0.03em;
  }

  .advisor-mode .advisor-banner { display: block; }

  /* -- Advisor-specific: pending pill -- */
  .pending-pill {
    display: none;
    background: rgba(234,179,8,0.15);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
  }

  .pending-pill:hover { background: rgba(234,179,8,0.25); }

  .advisor-mode .pending-pill { display: flex; }

  /* -- Mode value color switching -- */
  .mode-value-auto { color: var(--accent); }
  .mode-value-advisor { color: var(--warning); }

  /* -- Layout -- */
  .dashboard {
    max-width: 1440px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* -- Panels -- */
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--info);
  }

  .panel-meta {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-meta .live-label {
    color: var(--accent);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* -- Health Charts -- */
  .charts-panel .chart-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .mini-chart { position: relative; }
  .mini-chart-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .mini-chart canvas { width: 100% !important; height: 64px !important; }

  @media (max-width: 900px) {
    .charts-panel .chart-row { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 500px) {
    .charts-panel .chart-row { grid-template-columns: 1fr; }
  }

  /* -- Terminal Feed -- */
  .terminal-panel {
    border-left: 2px solid var(--accent);
    height: 380px;
    overflow: hidden;
  }

  .advisor-mode .terminal-panel {
    border-left-color: var(--warning);
  }

  .terminal {
    background: var(--bg-terminal);
    border-radius: 6px;
    padding: 12px 16px;
    height: 100%;
    overflow-y: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    line-height: 1.7;
    display: flex;
    flex-direction: column;
  }

  .terminal-inner {
    margin-top: auto;
  }

  .terminal::-webkit-scrollbar { width: 4px; }
  .terminal::-webkit-scrollbar-track { background: transparent; }
  .terminal::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .term-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transform: translateY(4px);
    animation: termIn 0.3s ease-out forwards;
  }

  @keyframes termIn {
    to { opacity: 1; transform: translateY(0); }
  }

  .t-tick { color: var(--text-secondary); }
  .t-ok { color: var(--accent); }
  .t-check { color: var(--accent); }
  .t-skip { color: var(--warning); }
  .t-fail { color: var(--danger); }
  .t-principle { color: var(--text-primary); font-weight: 500; }
  .t-param { color: var(--text-tertiary); }
  .t-old { color: var(--text-value); font-variant-numeric: tabular-nums; }
  .t-arrow { color: var(--info); }
  .t-new { color: var(--accent); font-variant-numeric: tabular-nums; }
  .t-meta { color: var(--text-secondary); }
  .t-violation-id { color: var(--warning); }
  .t-violation-desc { color: var(--text-tertiary); }
  .t-status-label { color: var(--text-tertiary); }
  .t-status-value { color: var(--accent); font-variant-numeric: tabular-nums; }
  .t-dim { color: var(--text-secondary); }
  .t-white { color: var(--text-primary); }
  .t-separator { color: var(--info); }
  .t-pending-icon { color: var(--warning); }
  .t-pending-val { color: var(--warning); font-variant-numeric: tabular-nums; }

  /* -- Advisor Inline Buttons -- */
  .advisor-btn {
    display: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    border: 1px solid;
    margin-left: 6px;
    vertical-align: middle;
    line-height: 1.4;
    transition: background 0.15s;
  }

  .advisor-mode .advisor-btn { display: inline-flex; align-items: center; }

  .advisor-btn.approve-btn {
    background: rgba(34,197,94,0.15);
    color: var(--accent);
    border-color: rgba(34,197,94,0.3);
  }
  .advisor-btn.approve-btn:hover { background: rgba(34,197,94,0.25); }

  .advisor-btn.reject-btn {
    background: rgba(239,68,68,0.1);
    color: var(--danger);
    border-color: rgba(239,68,68,0.2);
  }
  .advisor-btn.reject-btn:hover { background: rgba(239,68,68,0.2); }

  /* Approved/Rejected flash labels */
  .action-flash {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    margin-left: 8px;
    animation: flashIn 0.3s ease-out;
  }

  .action-flash.approved { color: var(--accent); }
  .action-flash.rejected { color: var(--info); }

  @keyframes flashIn {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* Dimmed line after rejection */
  .term-line.rejected-line { opacity: 0.5; }

  /* -- Alerts -- */
  .alert-card {
    background: var(--bg-root);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 8px;
    border-left: 3px solid transparent;
    overflow: hidden;
  }

  .alert-card.sev-high { border-left-color: var(--danger); }
  .alert-card.sev-med { border-left-color: var(--warning); }
  .alert-card.sev-low { border-left-color: var(--accent); }

  .alert-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .sev-badge {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    color: var(--bg-root);
    flex-shrink: 0;
  }

  .sev-badge.high { background: var(--danger); }
  .sev-badge.med { background: var(--warning); }
  .sev-badge.low { background: var(--accent); }

  .alert-principle-id { color: var(--warning); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .alert-principle-name { color: var(--text-primary); font-size: 12px; font-weight: 500; }
  .alert-evidence { color: var(--text-tertiary); font-size: 10px; margin-top: 2px; }
  .alert-suggestion { color: var(--accent); font-size: 10px; margin-top: 2px; }

  .alert-approve-btn {
    display: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    background: rgba(34,197,94,0.15);
    color: var(--accent);
    border: 1px solid rgba(34,197,94,0.3);
    border-radius: 3px;
    padding: 3px 10px;
    cursor: pointer;
    margin-top: 8px;
    transition: background 0.15s;
  }

  .alert-approve-btn:hover { background: rgba(34,197,94,0.25); }

  .alert-reject-btn {
    display: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    background: rgba(239,68,68,0.1);
    color: var(--danger);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 3px;
    padding: 3px 10px;
    cursor: pointer;
    margin-top: 8px;
    margin-left: 6px;
    transition: background 0.15s;
  }

  .alert-reject-btn:hover { background: rgba(239,68,68,0.2); }

  .advisor-mode .alert-approve-btn { display: inline-block; }
  .advisor-mode .alert-reject-btn { display: inline-block; }

  /* Alert resolved state */
  .alert-card.resolved {
    opacity: 0;
    max-height: 0;
    padding: 0 14px;
    margin-bottom: 0;
    overflow: hidden;
    transition: opacity 0.4s ease-out, max-height 0.5s ease-out 0.1s, padding 0.5s ease-out 0.1s, margin 0.5s ease-out 0.1s;
  }

  .alerts-scroll {
    overflow-y: auto;
    max-height: 300px;
  }

  .alerts-scroll::-webkit-scrollbar { width: 4px; }
  .alerts-scroll::-webkit-scrollbar-track { background: transparent; }
  .alerts-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* -- Persona Bars -- */
  .persona-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
  }

  .persona-label {
    width: 100px;
    text-align: right;
    color: var(--text-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .persona-bar-track {
    flex: 1;
    height: 12px;
    background: var(--bg-root);
    border-radius: 3px;
    overflow: hidden;
  }

  .persona-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s ease-out;
  }

  .persona-pct {
    width: 32px;
    text-align: right;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* -- Parameter Registry -- */
  .param-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid rgba(39,39,42,0.4);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }

  .param-row:last-child { border-bottom: none; }

  .param-name {
    color: var(--text-tertiary);
  }

  .param-val {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  .param-changed {
    color: var(--text-secondary);
    font-size: 9px;
    margin-left: 6px;
  }

  /* Ghost preview for pending recommendations */
  .param-ghost {
    display: none;
    color: var(--warning);
    font-size: 9px;
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
  }

  .advisor-mode .param-ghost { display: inline; }

  .param-pending-label {
    display: none;
    color: var(--warning);
    font-size: 9px;
    margin-left: 6px;
  }

  .advisor-mode .param-pending-label { display: inline; }

  .params-scroll {
    overflow-y: auto;
    max-height: 300px;
  }

  .params-scroll::-webkit-scrollbar { width: 4px; }
  .params-scroll::-webkit-scrollbar-track { background: transparent; }
  .params-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* -- Violations Table -- */
  .violations-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
  }

  .violations-table thead th {
    text-align: left;
    padding: 7px 8px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    position: sticky;
    top: 0;
    background: var(--bg-panel);
  }

  .violations-table thead th:hover { color: var(--text-tertiary); }

  .violations-table tbody td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(39,39,42,0.4);
    color: var(--text-value);
    font-variant-numeric: tabular-nums;
  }

  .violations-table tbody tr:hover td { background: rgba(39,39,42,0.3); }

  .table-scroll {
    overflow-y: auto;
    max-height: 240px;
  }

  .table-scroll::-webkit-scrollbar { width: 4px; }
  .table-scroll::-webkit-scrollbar-track { background: transparent; }
  .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .badge-applied { color: var(--accent); font-size: 10px; }
  .badge-skipped { color: var(--text-secondary); font-size: 10px; }
  .badge-rejected { color: var(--danger); font-size: 10px; opacity: 0.6; }

  /* Pending badge in violations table (advisor mode) */
  .badge-pending {
    display: none;
    color: var(--warning);
    font-size: 10px;
    cursor: pointer;
    position: relative;
  }

  .advisor-mode .badge-pending { display: inline-flex; align-items: center; gap: 4px; }

  .badge-pending:hover { text-decoration: underline; }

  /* Pending dropdown in violations table */
  .pending-dropdown {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 0;
    z-index: 20;
    min-width: 120px;
    box-shadow: 0 -4px 12px rgba(0,0,0,0.4);
  }

  .pending-dropdown.open { display: block; }

  .pending-dropdown-item {
    padding: 5px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .pending-dropdown-item:hover { background: rgba(39,39,42,0.5); }
  .pending-dropdown-item.approve-item { color: var(--accent); }
  .pending-dropdown-item.reject-item { color: var(--danger); }

  /* -- Bottom split row -- */
  .split-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* -- Empty state -- */
  .empty-state {
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-align: center;
    padding: 20px;
  }

  /* -- Responsive -- */
  @media (max-width: 768px) {
    .split-row { grid-template-columns: 1fr; }
    .header { flex-direction: column; align-items: flex-start; gap: 8px; }
    .header-right { flex-wrap: wrap; gap: 12px; }
    .dashboard { padding: 8px; gap: 8px; }
  }

  /* -- Reduced motion -- */
  @media (prefers-reduced-motion: reduce) {
    .term-line { animation: none; opacity: 1; transform: none; }
    .live-dot { animation: none; }
    .persona-bar-fill { transition: none; }
    .alert-card.resolved { transition: none; }
  }
</style>
</head>
<body>

<!-- Header -->
<header class="header" id="header">
  <div class="header-left">
    <span class="header-logo">AgentE</span>
    <span class="header-version">v1.8.0</span>
  </div>
  <div class="header-right">
    <div class="kpi-pill">
      <span class="label">Health</span>
      <span class="value health-good" id="h-health">--</span>
    </div>
    <div class="kpi-pill">
      <span class="label">Mode</span>
      <span class="value mode-value-auto" id="h-mode">--</span>
    </div>
    <div class="kpi-pill">
      <span class="label">Tick</span>
      <span class="value" id="h-tick">0</span>
    </div>
    <div class="kpi-pill pending-pill" id="pending-pill">
      <span class="label" style="color: var(--warning);">Pending</span>
      <span class="value" style="color: var(--warning);" id="h-pending">0</span>
    </div>
    <div class="kpi-pill">
      <span class="label">Uptime</span>
      <span class="value" id="h-uptime">0s</span>
    </div>
    <div class="kpi-pill">
      <div class="live-dot" id="live-dot" title="WebSocket connected"></div>
      <span style="color: var(--accent); font-size: 11px;">LIVE</span>
    </div>
  </div>
</header>

<!-- Advisor Banner -->
<div class="advisor-banner" id="advisor-banner">
  ADVISOR MODE \\u2014 AgentE is waiting for your approval before applying changes
</div>

<!-- Dashboard -->
<main class="dashboard" id="dashboard-root">

  <!-- Health & Metrics -->
  <div class="panel charts-panel">
    <div class="panel-header">
      <span class="panel-title">Health & Metrics</span>
    </div>
    <div class="chart-row">
      <div class="mini-chart">
        <div class="mini-chart-label">Health Score</div>
        <canvas id="chart-health"></canvas>
      </div>
      <div class="mini-chart">
        <div class="mini-chart-label">Gini Coefficient</div>
        <canvas id="chart-gini"></canvas>
      </div>
      <div class="mini-chart">
        <div class="mini-chart-label">Net Flow</div>
        <canvas id="chart-flow"></canvas>
      </div>
      <div class="mini-chart">
        <div class="mini-chart-label">Avg Satisfaction</div>
        <canvas id="chart-satisfaction"></canvas>
      </div>
    </div>
  </div>

  <!-- Decision Feed -->
  <div class="panel terminal-panel">
    <div class="panel-header">
      <span class="panel-title">Decision Feed</span>
      <div class="panel-meta">
        <span id="decision-count">0 decisions</span>
        <span class="live-label"><div class="live-dot" style="width:5px;height:5px;"></div> LIVE</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="terminal" id="terminal">
        <div id="terminal-inner"></div>
      </div>
    </div>
  </div>

  <!-- Active Alerts -->
  <div class="panel alerts-panel">
    <div class="panel-header">
      <span class="panel-title">Active Alerts</span>
      <span class="panel-meta" id="alerts-count">All clear</span>
    </div>
    <div class="alerts-scroll" id="alerts"></div>
  </div>

  <!-- Violation History -->
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Violation History</span>
      <span class="panel-meta">Last 100 decisions</span>
    </div>
    <div class="table-scroll">
      <table class="violations-table" id="violations-table">
        <thead>
          <tr>
            <th data-sort="tick">Tick</th>
            <th data-sort="principle">Principle</th>
            <th data-sort="severity">Sev</th>
            <th data-sort="parameter">Parameter</th>
            <th data-sort="result">Action</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody id="violations-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Persona Distribution + Parameters -->
  <div class="split-row">
    <div class="panel persona-panel">
      <div class="panel-header">
        <span class="panel-title">Persona Distribution</span>
        <span class="panel-meta" id="persona-count"></span>
      </div>
      <div id="persona-bars">
        <div class="empty-state">No persona data yet</div>
      </div>
    </div>

    <div class="panel params-panel">
      <div class="panel-header">
        <span class="panel-title">Parameters</span>
        <span class="panel-meta" id="params-count"></span>
      </div>
      <div class="params-scroll" id="params-list">
        <div class="empty-state">No parameters registered</div>
      </div>
    </div>
  </div>

</main>

<script>
(function() {
  'use strict';

  // -- State --
  var ws = null;
  var reconnectDelay = 1000;
  var MAX_RECONNECT = 30000;
  var isAdvisor = false;
  var pendingDecisions = [];
  var MAX_TERMINAL_LINES = 80;
  var MAX_VIOLATIONS = 100;
  var violationSortKey = 'tick';
  var violationSortAsc = false;
  var violations = [];
  var decisionCount = 0;

  // Chart instances
  var chartHealth, chartGini, chartFlow, chartSatisfaction;

  // Param state for registry display
  var paramRegistry = [];
  var paramValues = {};
  var paramLastTick = {};
  var paramPending = {};
  var currentTick = 0;

  // -- DOM refs --
  var $hHealth = document.getElementById('h-health');
  var $hMode = document.getElementById('h-mode');
  var $hTick = document.getElementById('h-tick');
  var $hUptime = document.getElementById('h-uptime');
  var $hPending = document.getElementById('h-pending');
  var $liveDot = document.getElementById('live-dot');
  var $terminal = document.getElementById('terminal');
  var $terminalInner = document.getElementById('terminal-inner');
  var $alerts = document.getElementById('alerts');
  var $alertsCount = document.getElementById('alerts-count');
  var $violationsBody = document.getElementById('violations-body');
  var $personaBars = document.getElementById('persona-bars');
  var $paramsList = document.getElementById('params-list');
  var $paramsCount = document.getElementById('params-count');
  var $personaCount = document.getElementById('persona-count');
  var $decisionCount = document.getElementById('decision-count');
  var $dashboardRoot = document.getElementById('dashboard-root');

  // -- Helpers --
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\\\\/g,'&#92;'); }
  function pad(n, w) { return String(n).padStart(w || 4, ' '); }
  function fmt(n) { return typeof n === 'number' ? n.toFixed(3) : '\\u2014'; }
  function pct(n) { return typeof n === 'number' ? (n * 100).toFixed(0) + '%' : '\\u2014'; }

  function formatUptime(ms) {
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    var h = Math.floor(s / 3600);
    return h + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  function healthClass(h) {
    if (h >= 70) return 'health-good';
    if (h >= 40) return 'health-warn';
    return 'health-bad';
  }

  function sevClass(s) {
    if (s >= 7) return 'high';
    if (s >= 4) return 'med';
    return 'low';
  }

  function sevCardClass(s) {
    if (s >= 7) return 'sev-high';
    if (s >= 4) return 'sev-med';
    return 'sev-low';
  }

  function personaColor(name) {
    var n = (name || '').toLowerCase();
    if (n === 'atrisk' || n === 'at_risk' || n === 'dormant') return 'var(--danger)';
    if (n === 'spender' || n === 'newentrant' || n === 'new_entrant' || n === 'passive') return 'var(--warning)';
    return 'var(--accent)';
  }

  // -- Chart setup --
  var chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#a1a1aa',
        bodyColor: '#d4d4d8',
        titleFont: { family: 'JetBrains Mono', size: 10 },
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        borderColor: '#27272a',
        borderWidth: 1,
        padding: 8,
      }
    },
    scales: {
      x: { display: false },
      y: {
        grid: { color: 'rgba(39,39,42,0.5)', drawBorder: false },
        ticks: {
          color: '#52525b',
          font: { family: 'JetBrains Mono', size: 9 },
          maxTicksLimit: 3,
        },
        border: { display: false },
      }
    },
    elements: {
      point: { radius: 0, hoverRadius: 3, backgroundColor: '#22c55e' },
      line: { borderWidth: 1.5, tension: 0.3 },
    }
  };

  function makeChart(id, color, minY, maxY) {
    var ctx = document.getElementById(id).getContext('2d');
    var opts = JSON.parse(JSON.stringify(chartOpts));
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
    chartFlow = makeChart('chart-flow', '#3b82f6');
    chartSatisfaction = makeChart('chart-satisfaction', '#22c55e', 0, 100);
  }

  function updateChart(chart, labels, data) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('none');
  }

  // -- Terminal --
  function addTerminalLine(html) {
    var el = document.createElement('div');
    el.className = 'term-line';
    el.innerHTML = html;
    $terminalInner.appendChild(el);
    while ($terminalInner.children.length > MAX_TERMINAL_LINES) {
      $terminalInner.removeChild($terminalInner.firstChild);
    }
    $terminal.scrollTop = $terminal.scrollHeight;
  }

  function decisionToTerminal(d) {
    var resultIcon = d.result === 'applied'
      ? '<span class="t-check">\\u2705 </span>'
      : d.result === 'rejected'
        ? '<span class="t-fail">\\u274c </span>'
        : d.result === 'skipped_override'
          ? '<span class="t-pending-icon">\\u23f3 </span>'
          : '<span class="t-skip">\\u23f8 </span>';

    var principle = d.diagnosis?.principle || {};
    var plan = d.plan || {};
    var severity = d.diagnosis?.violation?.severity ?? '?';
    var confidence = d.diagnosis?.violation?.confidence;
    var confStr = confidence != null ? (confidence * 100).toFixed(0) + '%' : '?';

    var advisorBtns = '';
    if (isAdvisor && d.result === 'skipped_override') {
      advisorBtns = '<span class="advisor-btn-group" data-id="' + esc(d.id) + '">'
        + '<button class="advisor-btn approve-btn" data-action="approve" data-id="' + esc(d.id) + '">&#10003; Approve</button>'
        + '<button class="advisor-btn reject-btn" data-action="reject" data-id="' + esc(d.id) + '">&#10005; Reject</button>'
        + '</span>';
    }

    return '<span class="t-tick">[Tick ' + pad(d.tick) + ']</span> '
      + resultIcon
      + '<span class="t-principle">' + esc(principle.name || '') + ':</span> '
      + '<span class="t-param">' + esc(plan.parameter || '\\u2014') + ' </span>'
      + '<span class="t-old">' + fmt(plan.currentValue) + '</span>'
      + '<span class="t-arrow"> \\u2192 </span>'
      + (d.result === 'skipped_override'
        ? '<span class="t-pending-val">' + fmt(plan.targetValue) + '</span>'
        : '<span class="t-new">' + fmt(plan.targetValue) + '</span>')
      + '<span class="t-meta">  sev ' + severity + ', conf ' + confStr + '</span>'
      + advisorBtns;
  }

  // -- Alerts --
  function renderAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      $alerts.innerHTML = '<div class="empty-state">No active violations. Economy is healthy.</div>';
      $alertsCount.textContent = 'All clear';
      return;
    }
    var sorted = alerts.slice().sort(function(a, b) { return (b.severity || 0) - (a.severity || 0); });
    $alertsCount.textContent = sorted.length + ' violation' + (sorted.length !== 1 ? 's' : '');

    $alerts.innerHTML = sorted.map(function(a) {
      var sev = a.severity || a.violation?.severity || 0;
      var sc = sevClass(sev);
      var cardCls = sevCardClass(sev);
      var name = a.principleName || a.principle?.name || '?';
      var pid = a.principleId || a.principle?.id || '?';
      var reason = a.reasoning || a.violation?.suggestedAction?.reasoning || '';
      var suggestion = a.suggestion || '';

      var hasPending = isAdvisor && pendingDecisions.some(function(pd) {
        return pd.principleId === pid || (pd.diagnosis?.principle?.id === pid);
      });

      var btns = '';
      if (hasPending) {
        btns = '<button class="alert-approve-btn" data-action="approve-alert" data-principle="' + esc(pid) + '">&#10003; Approve Fix</button>'
          + '<button class="alert-reject-btn" data-action="reject-alert" data-principle="' + esc(pid) + '">&#10007; Reject</button>';
      }

      return '<div class="alert-card ' + cardCls + '" data-principle-id="' + esc(pid) + '">'
        + '<div class="alert-top">'
        + '<span class="sev-badge ' + sc + '">' + sev + '</span>'
        + '<span class="alert-principle-name">[' + esc(pid) + '] ' + esc(name) + '</span>'
        + '</div>'
        + (reason ? '<div class="alert-evidence">' + esc(reason) + '</div>' : '')
        + (suggestion ? '<div class="alert-suggestion">Suggested: ' + esc(suggestion) + '</div>' : '')
        + btns
        + '</div>';
    }).join('');
  }

  // -- Violations table --
  function addViolation(d) {
    var plan = d.plan || {};
    violations.push({
      tick: d.tick,
      principle: (d.diagnosis?.principle?.id || '?') + ' ' + (d.diagnosis?.principle?.name || ''),
      severity: d.diagnosis?.violation?.severity || 0,
      parameter: plan.parameter || '\\u2014',
      result: d.result,
      currentValue: plan.currentValue,
      targetValue: plan.targetValue,
      decisionId: d.id,
    });
    if (violations.length > MAX_VIOLATIONS) violations.shift();
    decisionCount = violations.length;
    $decisionCount.textContent = decisionCount + ' decisions';
    renderViolations();
  }

  function renderViolations() {
    var sorted = violations.slice().sort(function(a, b) {
      var va = a[violationSortKey], vb = b[violationSortKey];
      if (va < vb) return violationSortAsc ? -1 : 1;
      if (va > vb) return violationSortAsc ? 1 : -1;
      return 0;
    });
    $violationsBody.innerHTML = sorted.map(function(v) {
      var isPending = v.result === 'skipped_override';

      var actionHtml;
      if (isPending && isAdvisor) {
        actionHtml = '<span class="badge-pending" data-action="toggle-pending" data-id="' + esc(v.decisionId || '') + '">'
          + 'Pending \\u25BE'
          + '<div class="pending-dropdown">'
          + '<div class="pending-dropdown-item approve-item" data-action="approve" data-id="' + esc(v.decisionId || '') + '">&#10003; Approve</div>'
          + '<div class="pending-dropdown-item reject-item" data-action="reject" data-id="' + esc(v.decisionId || '') + '">&#10007; Reject</div>'
          + '</div>'
          + '</span>';
      } else if (v.result === 'applied') {
        actionHtml = '<span class="badge-applied">Applied</span>';
      } else if (v.result === 'rejected') {
        actionHtml = '<span class="badge-rejected">Rejected</span>';
      } else {
        actionHtml = '<span class="badge-skipped">' + esc(v.result || 'Skipped') + '</span>';
      }

      var changeHtml = '';
      if (v.currentValue != null && v.targetValue != null) {
        var valColor = isPending && isAdvisor ? 'var(--warning)' : 'var(--accent)';
        changeHtml = '<span style="color:var(--text-value)">' + fmt(v.currentValue) + '</span>'
          + '<span style="color:var(--info)"> \\u2192 </span>'
          + '<span style="color:' + valColor + '">' + fmt(v.targetValue) + '</span>';
      }

      var sevColor = v.severity >= 7 ? 'var(--danger)' : v.severity >= 4 ? 'var(--warning)' : 'var(--accent)';

      return '<tr>'
        + '<td style="color:var(--text-secondary)">' + v.tick + '</td>'
        + '<td style="color:var(--text-value)">' + esc(v.principle) + '</td>'
        + '<td style="color:' + sevColor + '">' + v.severity + '</td>'
        + '<td style="color:var(--text-tertiary)">' + esc(v.parameter) + '</td>'
        + '<td class="action-cell">' + actionHtml + '</td>'
        + '<td>' + changeHtml + '</td>'
        + '</tr>';
    }).join('');
  }

  // Table sorting
  document.querySelectorAll('.violations-table th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var key = th.dataset.sort;
      if (violationSortKey === key) violationSortAsc = !violationSortAsc;
      else { violationSortKey = key; violationSortAsc = true; }
      renderViolations();
    });
  });

  // -- Personas --
  function renderPersonas(dist) {
    if (!dist || Object.keys(dist).length === 0) {
      $personaBars.innerHTML = '<div class="empty-state">No persona data yet</div>';
      $personaCount.textContent = '';
      return;
    }
    var total = Object.values(dist).reduce(function(s, v) { return s + v; }, 0);
    $personaCount.textContent = total + ' agents';
    var entries = Object.entries(dist).sort(function(a, b) { return b[1] - a[1]; });
    $personaBars.innerHTML = entries.map(function(e) {
      var pctVal = total > 0 ? (e[1] / total * 100) : 0;
      var color = personaColor(e[0]);
      return '<div class="persona-row">'
        + '<span class="persona-label">' + esc(e[0]) + '</span>'
        + '<div class="persona-bar-track"><div class="persona-bar-fill" style="width:' + pctVal.toFixed(0) + '%;background:' + color + ';"></div></div>'
        + '<span class="persona-pct">' + pctVal.toFixed(0) + '%</span>'
        + '</div>';
    }).join('');
  }

  // -- Parameters --
  function renderParams(principles, registryValues) {
    if ((!principles || principles.length === 0) && Object.keys(paramValues).length === 0) {
      $paramsList.innerHTML = '<div class="empty-state">No parameters registered</div>';
      $paramsCount.textContent = '';
      return;
    }

    // If we have actual parameter values from API, show those
    if (registryValues && Object.keys(registryValues).length > 0) {
      var entries = Object.entries(registryValues);
      $paramsCount.textContent = entries.length + ' tracked';
      $paramsList.innerHTML = entries.map(function(e) {
        var key = e[0];
        var val = e[1];
        var ticksAgo = currentTick - (paramLastTick[key] || 0);
        var agoText = ticksAgo <= 0 ? '' : ticksAgo <= 5 ? 'just now' : ticksAgo + ' ticks ago';
        var pending = paramPending[key];

        if (pending && isAdvisor) {
          return '<div class="param-row">'
            + '<span class="param-name">' + esc(key) + '</span>'
            + '<span>'
            + '<span class="param-val">' + fmt(val) + '</span>'
            + '<span class="param-ghost" style="display:inline;"> \\u2192 ' + fmt(pending.proposedVal) + '?</span>'
            + '<span class="param-pending-label" style="display:inline;">pending</span>'
            + '</span>'
            + '</div>';
        }
        return '<div class="param-row">'
          + '<span class="param-name">' + esc(key) + '</span>'
          + '<span><span class="param-val">' + fmt(val) + '</span>'
          + (agoText ? '<span class="param-changed">' + agoText + '</span>' : '')
          + '</span>'
          + '</div>';
      }).join('');
      return;
    }

    // Fallback: show principle names (legacy behavior)
    if (principles && principles.length > 0) {
      $paramsCount.textContent = principles.length + ' registered';
      $paramsList.innerHTML = principles.slice(0, 30).map(function(p) {
        return '<div class="param-row">'
          + '<span class="param-name">[' + esc(p.id) + ']</span>'
          + '<span class="param-val">' + esc(p.name) + '</span>'
          + '</div>';
      }).join('');
    }
  }

  // -- KPI update --
  function updateKPIs(data) {
    if (data.health != null) {
      $hHealth.textContent = data.health + '/100';
      $hHealth.className = 'value ' + healthClass(data.health);
    }
    if (data.mode != null) {
      $hMode.textContent = data.mode;
      isAdvisor = data.mode === 'advisor';
      $hMode.className = 'value ' + (isAdvisor ? 'mode-value-advisor' : 'mode-value-auto');
      document.body.classList.toggle('advisor-mode', isAdvisor);
    }
    if (data.tick != null) {
      $hTick.textContent = data.tick;
      currentTick = data.tick;
    }
    if (data.uptime != null) $hUptime.textContent = formatUptime(data.uptime);
    if (data.pendingCount != null || data.activePlans != null) {
      var count = data.pendingCount || data.activePlans || 0;
      $hPending.textContent = count;
    }
  }

  // -- Metrics history --
  function updateChartsFromHistory(history) {
    if (!history || history.length === 0) return;
    var ticks = history.map(function(h) { return h.tick; });
    updateChart(chartHealth, ticks, history.map(function(h) { return h.health; }));
    updateChart(chartGini, ticks, history.map(function(h) { return h.giniCoefficient; }));
    updateChart(chartFlow, ticks, history.map(function(h) { return h.netFlow; }));
    updateChart(chartSatisfaction, ticks, history.map(function(h) { return h.avgSatisfaction; }));
  }

  // -- API calls --
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
      if (data.principles) {
        paramRegistry = data.principles;
        renderParams(data.principles, paramValues);
      }
    }).catch(function() {});

    fetchJSON('/pending').then(function(data) {
      if (data.pending) {
        pendingDecisions = data.pending;
        $hPending.textContent = data.count || 0;
      }
    }).catch(function() {});
  }

  // -- Polling fallback --
  var pollInterval = null;

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

  // -- WebSocket --
  function connectWS() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);

    ws.onopen = function() {
      reconnectDelay = 1000;
      $liveDot.classList.remove('disconnected');
      $liveDot.title = 'WebSocket connected';
      stopPolling();
      ws.send(JSON.stringify({ type: 'health' }));
    };

    ws.onclose = function() {
      $liveDot.classList.add('disconnected');
      $liveDot.title = 'WebSocket disconnected \\u2014 reconnecting...';
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
            $hPending.textContent = pendingDecisions.length;
          }
          break;
      }
    };
  }

  // -- Advisor actions (event delegation) --
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    var principleId = btn.getAttribute('data-principle');

    // Toggle pending dropdown
    if (action === 'toggle-pending') {
      var dropdown = btn.querySelector('.pending-dropdown');
      if (!dropdown) return;
      document.querySelectorAll('.pending-dropdown.open').forEach(function(d) {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
      e.stopPropagation();
      return;
    }

    // Approve from alert card
    if (action === 'approve-alert' && principleId) {
      var pd = pendingDecisions.find(function(d) {
        return d.principleId === principleId || (d.diagnosis?.principle?.id === principleId);
      });
      if (pd) {
        postJSON('/approve', { decisionId: pd.id }).then(function(data) {
          if (data.ok) {
            addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-check">\\u2705 Approved ' + esc(pd.id) + '</span>');
          }
        }).catch(function() {});
      }
      return;
    }

    // Reject from alert card
    if (action === 'reject-alert' && principleId) {
      var pd2 = pendingDecisions.find(function(d) {
        return d.principleId === principleId || (d.diagnosis?.principle?.id === principleId);
      });
      if (pd2) {
        var reason = prompt('Rejection reason (optional):');
        postJSON('/reject', { decisionId: pd2.id, reason: reason || undefined }).then(function(data) {
          if (data.ok) {
            addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-fail">\\u274c Rejected ' + esc(pd2.id) + '</span>');
          }
        }).catch(function() {});
      }
      return;
    }

    if (!id) return;

    if (action === 'approve') {
      postJSON('/approve', { decisionId: id }).then(function(data) {
        if (data.ok) {
          addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-check">\\u2705 Approved ' + esc(id) + '</span>');
        }
      }).catch(function() {});
    } else if (action === 'reject') {
      var reason2 = prompt('Rejection reason (optional):');
      postJSON('/reject', { decisionId: id, reason: reason2 || undefined }).then(function(data) {
        if (data.ok) {
          addTerminalLine('<span class="t-tick">[Advisor]</span> <span class="t-fail">\\u274c Rejected ' + esc(id) + '</span>');
        }
      }).catch(function() {});
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.badge-pending')) {
      document.querySelectorAll('.pending-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
    }
  });

  // -- Init --
  initCharts();
  loadInitialData();
  connectWS();

})();
</script>
</body>
</html>`;
}
