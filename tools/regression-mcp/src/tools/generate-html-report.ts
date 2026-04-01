import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { findRepositoryRoot, resolveFromRepoRoot } from "../config.js";
import type {
  EvaluatePolicyCoverageOutput,
  FlowCoverageScore,
  GenerateHtmlReportInput,
  GenerateHtmlReportOutput,
  UnifiedReviewOutput,
} from "../types.js";

const DEFAULT_OUTPUT_PATH = "artifacts/report.html";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

function gateIcon(passed: boolean): string {
  return passed ? "&#10003;" : "&#10007;";
}

function gateClass(passed: boolean): string {
  return passed ? "gate-pass" : "gate-fail";
}

function buildFlowScoresJson(scores: FlowCoverageScore[]): string {
  return JSON.stringify(
    scores.map((s) => ({
      flowId: s.flowId,
      overall: s.overallScore,
      mustHold: s.mustHoldCoverage,
      regression: s.regressionCoverage,
      branch: s.branchCoverage,
      totalScenarios: s.totalScenarios,
      implementedScenarios: s.implementedScenarios,
      scaffoldScenarios: s.scaffoldScenarios,
      uncoveredScenarios: s.uncoveredScenarios,
      totalMustHold: s.totalMustHold,
      coveredMustHold: s.coveredMustHold,
      uncoveredMustHold: s.uncoveredMustHold,
    })),
  );
}

function renderStyles(): string {
  return `<style>
  :root {
    --bg: #0f172a; --bg2: #1e293b; --bg3: #334155;
    --fg: #e2e8f0; --fg2: #94a3b8; --accent: #818cf8;
    --green: #4ade80; --yellow: #facc15; --orange: #fb923c; --red: #f87171;
    --radius: 8px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: var(--bg); color: var(--fg); padding: 24px; }
  h1 { font-size: 1.6rem; margin-bottom: 4px; }
  h2 { font-size: 1.2rem; margin: 24px 0 12px; color: var(--accent); border-bottom: 1px solid var(--bg3); padding-bottom: 6px; }
  h3 { font-size: 1rem; margin: 16px 0 8px; color: var(--fg2); }
  .subtitle { color: var(--fg2); font-size: 0.85rem; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .card { background: var(--bg2); border-radius: var(--radius); padding: 16px; border: 1px solid var(--bg3); }
  .card-full { grid-column: 1 / -1; }
  .score-big { font-size: 2.5rem; font-weight: 700; }
  .score-label { font-size: 0.8rem; color: var(--fg2); text-transform: uppercase; letter-spacing: 1px; }
  .risk-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .risk-low { background: #16a34a33; color: var(--green); }
  .risk-medium { background: #ca8a0433; color: var(--yellow); }
  .risk-high { background: #ea580c33; color: var(--orange); }
  .risk-critical { background: #dc262633; color: var(--red); }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; color: var(--fg2); padding: 8px; border-bottom: 1px solid var(--bg3); font-weight: 500; }
  td { padding: 8px; border-bottom: 1px solid var(--bg3); }
  .gate-pass { color: var(--green); font-weight: 700; }
  .gate-fail { color: var(--red); font-weight: 700; }
  .chart-container { width: 100%; display: flex; justify-content: center; }
  svg text { fill: var(--fg); font-size: 11px; }
  .treemap-cell { cursor: pointer; stroke: var(--bg); stroke-width: 2px; }
  .treemap-label { fill: white; font-size: 11px; font-weight: 600; pointer-events: none; }
  .treemap-score { fill: white; font-size: 18px; font-weight: 700; pointer-events: none; opacity: 0.9; }
  .tooltip { position: absolute; background: var(--bg2); border: 1px solid var(--bg3); border-radius: 6px; padding: 10px 14px; font-size: 0.8rem; pointer-events: none; opacity: 0; transition: opacity 0.15s; z-index: 100; max-width: 320px; }
  .tooltip .tt-title { font-weight: 600; margin-bottom: 4px; }
  .tooltip .tt-row { color: var(--fg2); }
  .radar-axis-label { font-size: 11px; fill: var(--fg2); }
  .actions-list { list-style: none; }
  .actions-list li { padding: 6px 0; border-bottom: 1px solid var(--bg3); font-size: 0.85rem; }
  .actions-list li::before { content: "→ "; color: var(--accent); }
  #flow-detail { display: none; }
  #flow-detail.active { display: block; }
  .back-btn { background: var(--bg3); border: none; color: var(--fg); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; margin-bottom: 12px; }
  .back-btn:hover { background: var(--accent); }
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
</style>`;
}

function renderSummaryCards(data: UnifiedReviewOutput): string {
  const reg = data.regressionReview;
  const cov = data.policyCoverage;

  return `<div class="grid">
  <!-- Summary cards -->
  <div class="card">
    <div class="score-label">Policy Coverage</div>
    <div class="score-big" style="color:${scoreColor(cov.overallScore)}">${cov.overallScore}%</div>
    <div class="score-label" style="margin-top:4px">threshold: ${cov.coverageGateThreshold}%</div>
  </div>
  <div class="card">
    <div class="score-label">Test Results</div>
    <div class="score-big" style="color:${reg.passFailSummary.totals.failed > 0 ? "var(--red)" : "var(--green)"}">
      ${reg.passFailSummary.totals.passed}/${reg.passFailSummary.totals.tests}
    </div>
    <div class="score-label" style="margin-top:4px">${reg.passFailSummary.runnerStatus === "skipped" ? "skipped" : `${reg.passFailSummary.totals.failed} failed, ${reg.passFailSummary.totals.skipped} skipped`}</div>
  </div>
</div>`;
}

function renderQualityGates(
  gates: UnifiedReviewOutput["qualityGates"],
  cov: EvaluatePolicyCoverageOutput,
): string {
  return `<h2>Quality Gates</h2>
<div class="card">
<table>
  <tr><th>Gate</th><th>Status</th></tr>
  <tr><td>Suite Completeness</td><td class="${gateClass(gates.suiteCompletenessGatePassed)}">${gateIcon(gates.suiteCompletenessGatePassed)} ${gates.suiteCompletenessGatePassed ? "Passed" : "Failed"}</td></tr>
  <tr><td>Policy Coverage (>= ${cov.coverageGateThreshold}%)</td><td class="${gateClass(gates.policyCoverageGatePassed)}">${gateIcon(gates.policyCoverageGatePassed)} ${gates.policyCoverageGatePassed ? "Passed" : "Failed"} (${cov.overallScore}%)</td></tr>
  <tr><td>Regression Risk</td><td class="${gateClass(gates.regressionRiskGatePassed)}">${gateIcon(gates.regressionRiskGatePassed)} ${gates.regressionRiskGatePassed ? "Passed" : "Failed"}</td></tr>
  <tr style="font-weight:700"><td>Combined</td><td class="${gateClass(gates.combinedGatePassed)}">${gateIcon(gates.combinedGatePassed)} ${gates.combinedGatePassed ? "ALL PASSED" : "BLOCKED"}</td></tr>
</table>
</div>`;
}

function renderChartScript(flowScoresJson: string): string {
  return `<script>
const FLOW_SCORES = ${flowScoresJson};

const tooltip = d3.select("#tooltip");
function showTooltip(evt, html) {
  tooltip.html(html).style("opacity", 1)
    .style("left", (evt.pageX + 12) + "px")
    .style("top", (evt.pageY - 10) + "px");
}
function hideTooltip() { tooltip.style("opacity", 0); }

function scoreColor(s) {
  if (s >= 80) return "#16a34a";
  if (s >= 60) return "#ca8a04";
  if (s >= 40) return "#ea580c";
  return "#dc2626";
}

function drawRadar(containerSelector, axes, opts) {
  var W = opts.width, H = opts.height, R = opts.radius;
  var labelOffset = opts.labelOffset || 20;
  var fillColor = opts.fillColor || "#818cf833";
  var strokeColor = opts.strokeColor || "#818cf8";
  var showTarget = opts.showTarget !== false;
  var showLabels = opts.showLabels !== false;
  var onDotClick = opts.onDotClick || null;

  var n = axes.length;
  var angleSlice = (2 * Math.PI) / n;
  var cx = W / 2, cy = H / 2;

  var svg = d3.select(containerSelector).append("svg").attr("width", W).attr("height", H);
  var g = svg.append("g").attr("transform", "translate(" + cx + "," + cy + ")");

  // Grid rings
  [0.25, 0.5, 0.75, 1].forEach(function(level) {
    var r = R * level;
    var pts = d3.range(n).map(function(i) {
      var a = angleSlice * i - Math.PI / 2;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    g.append("polygon").attr("points", pts.map(function(p) { return p.join(","); }).join(" "))
      .style("fill", "none").style("stroke", "#334155").style("stroke-width", "1");
    if (opts.showLevelLabels) {
      g.append("text").attr("x", 4).attr("y", -r).style("fill", "#64748b").style("font-size", "9px")
        .text(Math.round(level * 100) + "%");
    }
  });

  // Axis lines and labels
  axes.forEach(function(ax, i) {
    var a = angleSlice * i - Math.PI / 2;
    g.append("line").attr("x1", 0).attr("y1", 0)
      .attr("x2", R * Math.cos(a)).attr("y2", R * Math.sin(a))
      .style("stroke", "#334155").style("stroke-width", "1");
    if (showLabels) {
      var lx = (R + labelOffset) * Math.cos(a), ly = (R + labelOffset) * Math.sin(a);
      g.append("text").attr("class", "radar-axis-label")
        .attr("x", lx).attr("y", ly).attr("text-anchor", "middle").attr("dy", "0.35em")
        .text(ax.label);
    }
  });

  // Data polygon
  var dataPts = axes.map(function(ax, i) {
    var a = angleSlice * i - Math.PI / 2;
    var r = R * ax.value;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  g.append("polygon").attr("points", dataPts.map(function(p) { return p.join(","); }).join(" "))
    .style("fill", fillColor).style("stroke", strokeColor).style("stroke-width", "2");
  dataPts.forEach(function(p, i) {
    var dot = g.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 4)
      .style("fill", strokeColor);
    if (onDotClick) {
      dot.style("cursor", "pointer").on("click", function() { onDotClick(i); });
    }
  });

  // Target ring (100% boundary, dashed)
  if (showTarget) {
    var targetPts = d3.range(n).map(function(i) {
      var a = angleSlice * i - Math.PI / 2;
      return [R * Math.cos(a), R * Math.sin(a)];
    });
    g.append("polygon").attr("points", targetPts.map(function(p) { return p.join(","); }).join(" "))
      .style("fill", "none").style("stroke", "#4ade8066").style("stroke-width", "1").style("stroke-dasharray", "4,4");
  }
}

(function drawTreemap() {
  if (FLOW_SCORES.length === 0) { d3.select("#treemap").append("p").text("No impacted flows.").style("color","#94a3b8"); return; }
  var W = Math.min(document.getElementById("treemap").clientWidth, 700);
  var H = Math.max(200, FLOW_SCORES.length * 60);
  var root = d3.hierarchy({ children: FLOW_SCORES.map(function(f) { return Object.assign({}, f, { value: Math.max(f.totalScenarios, 1) }); }) })
    .sum(function(d) { return d.value; }).sort(function(a, b) { return b.value - a.value; });
  d3.treemap().size([W, H]).padding(4).round(true)(root);
  var svg = d3.select("#treemap").append("svg").attr("width", W).attr("height", H);
  var cell = svg.selectAll("g").data(root.leaves()).enter().append("g")
    .attr("transform", function(d) { return "translate(" + d.x0 + "," + d.y0 + ")"; });
  cell.append("rect").attr("class","treemap-cell")
    .attr("width", function(d) { return d.x1 - d.x0; }).attr("height", function(d) { return d.y1 - d.y0; })
    .attr("fill", function(d) { return scoreColor(d.data.overall); }).attr("rx", 4)
    .on("mouseover", function(evt, d) { showTooltip(evt,
      '<div class="tt-title">' + d.data.flowId + '</div>' +
      '<div class="tt-row">Score: ' + d.data.overall + '%</div>' +
      '<div class="tt-row">Scenarios: ' + d.data.implementedScenarios + '/' + d.data.totalScenarios + ' impl</div>' +
      '<div class="tt-row">Must-hold: ' + d.data.coveredMustHold + '/' + d.data.totalMustHold + '</div>' +
      '<div class="tt-row">Branch: ' + d.data.branch + '%</div>'); })
    .on("mouseout", hideTooltip)
    .on("click", function(evt, d) { showFlowDetail(d.data); });
  cell.append("text").attr("class","treemap-label").attr("x", 8).attr("y", 20)
    .text(function(d) { var w = d.x1-d.x0; return w > 60 ? d.data.flowId : d.data.flowId.substring(0,3)+"…"; });
  cell.append("text").attr("class","treemap-score")
    .attr("x", function(d) { return (d.x1-d.x0)/2; }).attr("y", function(d) { return (d.y1-d.y0)/2 + 8; })
    .attr("text-anchor","middle")
    .text(function(d) { return d.data.overall + "%"; });
})();

(function drawGlobalRadar() {
  if (FLOW_SCORES.length === 0) { d3.select("#radar-global").append("p").text("No data.").style("color","#94a3b8"); return; }
  var axes = FLOW_SCORES.map(function(f) { return { label: f.flowId, value: f.overall/100 }; });
  drawRadar("#radar-global", axes, {
    width: 300, height: 300, radius: 110, labelOffset: 20,
    showTarget: true, showLabels: true, showLevelLabels: false,
    onDotClick: function(i) { showFlowDetail(FLOW_SCORES[i]); }
  });
})();

function showFlowDetail(flow) {
  document.getElementById("flow-detail").classList.add("active");
  document.getElementById("flow-detail-title").textContent = flow.flowId + " — " + flow.overall + "%";

  var axes = [
    { label: "Must-hold", value: flow.mustHold / 100 },
    { label: "Regression", value: flow.regression / 100 },
    { label: "Branches", value: flow.branch / 100 },
  ];

  d3.select("#radar-flow").selectAll("*").remove();
  drawRadar("#radar-flow", axes, {
    width: 280, height: 280, radius: 90, labelOffset: 24,
    showTarget: false, showLabels: true, showLevelLabels: true,
    onDotClick: null
  });

  // Detail info
  var info = "<table style='width:100%'>";
  info += "<tr><th>Metric</th><th>Value</th></tr>";
  info += "<tr><td>Must-hold</td><td>" + flow.coveredMustHold + "/" + flow.totalMustHold + " (" + flow.mustHold + "%)</td></tr>";
  info += "<tr><td>Scenarios</td><td>" + flow.implementedScenarios + "/" + flow.totalScenarios + " implemented, " + flow.scaffoldScenarios + " scaffold</td></tr>";
  info += "<tr><td>Branch coverage</td><td>" + flow.branch + "%</td></tr>";
  if (flow.uncoveredMustHold.length > 0) {
    info += "<tr><td colspan='2' style='color:#f87171'>Uncovered invariants: " + flow.uncoveredMustHold.join("; ") + "</td></tr>";
  }
  if (flow.uncoveredScenarios.length > 0) {
    info += "<tr><td colspan='2' style='color:#fb923c'>Missing scenarios: " + flow.uncoveredScenarios.join("; ") + "</td></tr>";
  }
  info += "</table>";
  document.getElementById("flow-detail-info").innerHTML = info;
}

function hideFlowDetail() {
  document.getElementById("flow-detail").classList.remove("active");
}
</script>`;
}

function generateHtml(data: UnifiedReviewOutput): string {
  const reg = data.regressionReview;
  const cov = data.policyCoverage;
  const gates = data.qualityGates;

  const flowScoresJson = buildFlowScoresJson(cov.flowScores);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BobTheTester Report</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
${renderStyles()}
</head>
<body>

<h1>BobTheTester Report</h1>
<p class="subtitle">Generated ${escapeHtml(data.generatedAt)} &mdash; Risk: <span class="risk-badge risk-${data.overallRiskLevel}">${data.overallRiskLevel}</span></p>

${renderSummaryCards(data)}

${renderQualityGates(gates, cov)}

<!-- Treemap -->
<h2>Coverage by Flow</h2>
<p style="color:var(--fg2);font-size:0.8rem;margin-bottom:8px">Click a flow to see its detailed radar breakdown.</p>
<div class="card card-full">
  <div id="treemap" class="chart-container"></div>
</div>

<!-- Radar chart global -->
<h2>Flow Coverage Radar</h2>
<div class="grid">
  <div class="card">
    <div id="radar-global" class="chart-container"></div>
  </div>
  <div class="card" id="flow-detail">
    <button class="back-btn" onclick="hideFlowDetail()">&#8592; Back</button>
    <h3 id="flow-detail-title"></h3>
    <div id="radar-flow" class="chart-container"></div>
    <div id="flow-detail-info" style="margin-top:12px;font-size:0.85rem"></div>
  </div>
</div>

<!-- Failed tests -->
${
  reg.failedTests.length > 0
    ? `<h2>Failed Tests</h2>
<div class="card">
<table>
  <tr><th>Test</th></tr>
  ${reg.failedTests.map((t) => `<tr><td>${escapeHtml(t)}</td></tr>`).join("\n  ")}
</table>
</div>`
    : ""
}

<!-- Recommended Actions -->
<h2>Recommended Actions</h2>
<div class="card">
<ul class="actions-list">
  ${data.overallRecommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n  ")}
</ul>
</div>

<!-- Warnings -->
${
  data.warnings.length > 0
    ? `<h2>Warnings</h2>
<div class="card">
<ul class="actions-list">
  ${data.warnings.map((w) => `<li style="color:var(--yellow)">${escapeHtml(w)}</li>`).join("\n  ")}
</ul>
</div>`
    : ""
}

<div class="tooltip" id="tooltip"></div>

${renderChartScript(flowScoresJson)}
</body>
</html>`;
}

export async function generateHtmlReport(
  input: GenerateHtmlReportInput = {},
): Promise<GenerateHtmlReportOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const outputPath = resolveFromRepoRoot(repoRoot, input.outputPath ?? DEFAULT_OUTPUT_PATH);
  const warnings: string[] = [];

  if (!input.unifiedReviewOutput) {
    warnings.push("No unified review output provided. The HTML report will be empty.");
    const emptyHtml =
      "<!DOCTYPE html><html><head><title>BobTheTester</title></head><body><h1>No data</h1><p>Run generate_unified_review first.</p></body></html>";
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, emptyHtml, "utf-8");

    return {
      tool: "generate_html_report",
      outputPath,
      generatedAt: new Date().toISOString(),
      warnings,
    };
  }

  const html = generateHtml(input.unifiedReviewOutput);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf-8");

  return {
    tool: "generate_html_report",
    outputPath,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}
