"use strict";

/* ===================================================================
 * Token Cost Calculator
 *
 * Model:
 *   costPerRequest =
 *     inTokens  * inputPrice/M      +
 *     outTokens * outputPrice/M     +
 *     crTokens  * cacheReadPrice/M  +
 *     cwTokens  * cacheWritePrice/M
 *   requestsPerBudget = budget / costPerRequest
 *   tokensPerBudget  = requestsPerBudget * (in + out + cr + cw)
 *
 * All prices are in USD per 1,000,000 tokens (/M).
 * =================================================================== */

const M = 1_000_000;

/* ── default data ────────────────────────────────────────────────── */

const DEFAULT_ROWS = [
  { name: "Deepseek V4 Flash",   input: 0.22,  output: 0.66,  cacheRead: 0.007, cacheWrite: 0 },
  { name: "Claude Fable 5",   input: 10, output: 50,  cacheRead: 1, cacheWrite: 0 },
];

/* ── state ───────────────────────────────────────────────────────── */

let rows = [];          // { id, name, input, output, cacheRead, cacheWrite }
let nextId = 0;

function freshId() {
  return nextId++;
}

/* ── DOM refs ────────────────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);

const priceBody =   $("#price-body");
const resultBody =  $("#result-body");
const inTok =       $("#in-tok");
const outTok =      $("#out-tok");
const crTok =       $("#cr-tok");
const cwTok =       $("#cw-tok");
const budget =      $("#budget");

/* ── CSV dialog refs ─────────────────────────────────────────────── */
const csvDialog =   $("#csv-dialog");
const csvText =     $("#csv-text");
const csvFile =     $("#csv-file");
const csvErrors =   $("#csv-errors");
const csvApply =    $("#csv-apply");
const uploadName =  $("#upload-name");

/* ── formatting helpers ──────────────────────────────────────────── */

function fmtMoney(v) {
  if (!isFinite(v) || v == null) return "—";
  if (v === 0) return "$0.00";
  if (v < 0.000001) return "$" + v.toExponential(2);
  if (v < 0.0001)   return "$" + v.toFixed(7);
  if (v < 0.001)    return "$" + v.toFixed(6);
  if (v < 0.01)     return "$" + v.toFixed(5);
  if (v < 0.1)      return "$" + v.toFixed(4);
  if (v < 1)        return "$" + v.toFixed(3);
  if (v < 100)      return "$" + v.toFixed(2);
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPrice(v) {
  if (v === 0) return "$0";
  if (v < 0.001) return "$" + v.toFixed(4);
  if (v < 0.01)  return "$" + v.toFixed(4);
  return "$" + v.toFixed(3);
}

function fmtInt(v) {
  if (!isFinite(v) || v == null) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Math.round(v).toLocaleString("en-US");
}

/* ── price parsing ───────────────────────────────────────────────── */

function parsePrice(s) {
  if (s == null) return 0;
  var t = String(s).trim();
  if (t === "" || t === "-" || t === "—" || /free|n\/a|na/i.test(t)) return 0;
  return parseFloat(t.replace(/[$,]/g, "")) || 0;
}

/* ── render pricing table rows ───────────────────────────────────── */

function renderPriceRows() {
  var html = "";
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var initial = (r.name || "?").charAt(0);
    html += '<tr class="price-row" data-id="' + r.id + '">';
    html += '<td class="col-name">';
    html += '<div class="name-cell">';
    html += '<span class="initials">' + initial + '</span>';
    html += '<input type="text" data-field="name" placeholder="Provider name" value="' + esc(r.name) + '" />';
    html += '</div></td>';
    html += '<td class="col-num"><div class="px"><span class="dollar">$</span><input type="number" data-field="input" min="0" step="any" value="' + r.input + '" /></div></td>';
    html += '<td class="col-num"><div class="px"><span class="dollar">$</span><input type="number" data-field="output" min="0" step="any" value="' + r.output + '" /></div></td>';
    html += '<td class="col-num"><div class="px"><span class="dollar">$</span><input type="number" data-field="cacheRead" min="0" step="any" value="' + r.cacheRead + '" /></div></td>';
    html += '<td class="col-num"><div class="px"><span class="dollar">$</span><input type="number" data-field="cacheWrite" min="0" step="any" value="' + r.cacheWrite + '" /></div></td>';
    html += '<td class="col-actions"><button type="button" class="remove-btn" data-action="remove-row" data-id="' + r.id + '" title="Remove provider" aria-label="Remove ' + esc(r.name || "provider") + '">✕</button></td>';
    html += '</tr>';
  }
  priceBody.innerHTML = html;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── sync state from DOM ──────────────────────────────────────────── */

function syncFromDom() {
  var trs = priceBody.querySelectorAll("tr.price-row");
  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    var id = Number(tr.getAttribute("data-id"));
    var row = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].id === id) { row = rows[j]; break; }
    }
    if (!row) continue;
    row.name      = (tr.querySelector('[data-field="name"]').value || "").trim();
    row.input     = parsePrice(tr.querySelector('[data-field="input"]').value);
    row.output    = parsePrice(tr.querySelector('[data-field="output"]').value);
    row.cacheRead = parsePrice(tr.querySelector('[data-field="cacheRead"]').value);
    row.cacheWrite= parsePrice(tr.querySelector('[data-field="cacheWrite"]').value);
  }
}

/* ── recalc & render results ─────────────────────────────────────── */

function recalc() {
  syncFromDom();
  saveState();

  var inN  = Math.max(0, parseInt(inTok.value, 10) || 0);
  var outN   = Math.max(0, parseInt(outTok.value, 10) || 0);
  var crN    = Math.max(0, parseInt(crTok.value, 10) || 0);
  var cwN    = Math.max(0, parseInt(cwTok.value, 10) || 0);
  var perReq = inN + outN + crN + cwN;
  var bud    = Math.max(0, parseFloat(budget.value) || 0);

  var results = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.name) continue;
    var cost = (inN * r.input + outN * r.output + crN * r.cacheRead + cwN * r.cacheWrite) / M;
    var requests = bud > 0 && cost > 0 ? bud / cost : 0;
    var tokens = requests * perReq;
    results.push({ name: r.name, input: r.input, output: r.output, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, cost: cost, requests: requests, tokens: tokens, perReq: perReq });
  }

  results.sort(function (a, b) { return a.cost - b.cost; });

  renderResults(results, bud);
}

function renderResults(results, bud) {
  var html = "";

  if (results.length === 0) {
    html += '<tr class="empty-row"><td colspan="6"><strong>No providers yet</strong> — add one above or import a CSV to see the comparison.</td></tr>';
    resultBody.innerHTML = html;
    return;
  }

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var isBest = i === 0;

    html += isBest ? '<tr class="best">' : '<tr>';

    /* rank */
    html += '<td class="col-rank">' + (i + 1);
    if (isBest) html += ' <span class="badge">cheapest</span>';
    html += '</td>';

    /* name */
    html += '<td class="col-name">' + esc(r.name) + '</td>';

    /* cost/req */
    html += '<td class="col-num cost">' + fmtMoney(r.cost) + ' <span class="units">/ req</span></td>';

    /* requests */
    html += '<td class="col-num">' + (r.requests > 0 ? fmtInt(r.requests) : "—") + '</td>';

    /* tokens */
    html += '<td class="col-num">' + (r.tokens > 0 ? fmtInt(r.tokens) : "—") + '</td>';

    /* cost/1K out */
    html += '<td class="col-num">' + (r.output > 0 ? fmtPrice(r.output / 1000) : "—") + '</td>';

    html += '</tr>';
  }

  resultBody.innerHTML = html;
}

/* ── actions ──────────────────────────────────────────────────────── */

function addRow() {
  rows.push({ id: freshId(), name: "", input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  renderPriceRows();
  /* focus the name input of the newly added row */
  var lastTr = priceBody.lastElementChild;
  if (lastTr) {
    var nameInput = lastTr.querySelector('[data-field="name"]');
    if (nameInput) nameInput.focus();
  }
  recalc();
}

function removeRow(id) {
  var kept = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id !== id) kept.push(rows[i]);
  }
  rows = kept;
  renderPriceRows();
  recalc();
}

/* ── CSV import ────────────────────────────────────────────────────── */

var lastFocusedEl = null;

function openCsvDialog() {
  lastFocusedEl = document.activeElement;
  csvText.value = "";
  csvFile.value = "";
  uploadName.textContent = "";
  csvErrors.className = "dialog-errors";
  csvErrors.textContent = "";
  csvDialog.classList.add("open");
  /* lock body scroll while dialog is open */
  document.body.style.overflow = "hidden";
  /* move focus into the dialog */
  csvText.focus();
}

function closeCsvDialog() {
  csvDialog.classList.remove("open");
  document.body.style.overflow = "";
  /* restore focus to the trigger */
  if (lastFocusedEl && lastFocusedEl.focus) lastFocusedEl.focus();
}

/* focus trap: Tab cycles within the dialog, Shift+Tab wraps */
csvDialog.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeCsvDialog();
    return;
  }
  if (e.key !== "Tab") return;
  var focusables = csvDialog.querySelectorAll(
    'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function parseCsvRow(raw, lineNum) {
  /* split on commas, trimming whitespace */
  var parts = [];
  var current = "";
  var inQuotes = false;
  for (var ci = 0; ci < raw.length; ci++) {
    var ch = raw[ci];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());

  if (parts.length < 4) return null;

  var name = parts[0].replace(/^["']|["']$/g, "").trim();
  if (!name) return null;

  var input = parsePrice(parts[1]);
  var output = parsePrice(parts[2]);
  var cacheRead = parsePrice(parts[3]);
  var cacheWrite = parts.length > 4 ? parsePrice(parts[4]) : 0;

  if (isNaN(input) || isNaN(output) || isNaN(cacheRead) || isNaN(cacheWrite)) return null;

  return { name: name, input: input, output: output, cacheRead: cacheRead, cacheWrite: cacheWrite };
}

function applyCsv() {
  var raw = csvText.value.trim();
  if (!raw) {
    csvErrors.className = "dialog-errors error";
    csvErrors.textContent = "Paste CSV data or upload a file.";
    csvErrors.setAttribute("aria-live", "assertive");
    return;
  }

  var lines = raw.split("\n");
  var parsed = [];
  var errs = [];
  var headerSkipped = false;

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;

    /* skip header row if it looks like a header */
    if (!headerSkipped && /name|provider|input|output|cache|read|write|price|cost|token|model|/i.test(line)) {
      var first = line.split(",")[0].trim().toLowerCase();
      if (first === "name" || first === "provider" || first === "model") {
        headerSkipped = true;
        continue;
      }
    }

    var row = parseCsvRow(line, li + 1);
    if (!row) {
      errs.push("Line " + (li + 1) + ": could not parse — expected at least 4 comma-separated values (Name, Input, Output, Cache read).");
      continue;
    }
    if (row.name.length > 80) {
      errs.push("Line " + (li + 1) + ": provider name too long (max 80 chars).");
      continue;
    }
    if (row.input > 1000 || row.output > 1000 || row.cacheRead > 1000 || row.cacheWrite > 1000) {
      errs.push("Line " + (li + 1) + ": price exceeds reasonable range ($1000/M max).");
      continue;
    }
    /* XSS: name is already HTML-escaped via esc() in renderPriceRows, but reject angle brackets to be safe */
    if (/[<>]/.test(row.name)) {
      errs.push("Line " + (li + 1) + ": provider name contains invalid characters (< >).");
      continue;
    }

    parsed.push(row);
  }

  if (parsed.length === 0 && errs.length > 0) {
    csvErrors.className = "dialog-errors error";
    csvErrors.textContent = errs.join(" ");
    csvErrors.setAttribute("aria-live", "assertive");
    return;
  }

  if (parsed.length === 0) {
    csvErrors.className = "dialog-errors error";
    csvErrors.textContent = "No valid rows found in the CSV data. Check the format and try again.";
    csvErrors.setAttribute("aria-live", "assertive");
    return;
  }

  /* apply */
  rows = [];
  for (var pi = 0; pi < parsed.length; pi++) {
    rows.push({ id: freshId(), name: parsed[pi].name, input: parsed[pi].input, output: parsed[pi].output, cacheRead: parsed[pi].cacheRead, cacheWrite: parsed[pi].cacheWrite });
  }
  renderPriceRows();
  recalc();
  closeCsvDialog();
  csvErrors.removeAttribute("aria-live");
}

/* ── event wiring ────────────────────────────────────────────────── */

/* Event delegation: one listener on the price table body */
priceBody.addEventListener("input", recalc);

priceBody.addEventListener("click", function (e) {
  var target = e.target;
  while (target && target !== priceBody) {
    if (target.hasAttribute("data-action") && target.getAttribute("data-action") === "remove-row") {
      removeRow(Number(target.getAttribute("data-id")));
      return;
    }
    target = target.parentNode;
  }
});

/* Buttons by data-action */
document.addEventListener("click", function (e) {
  var target = e.target;
  var action = target.getAttribute("data-action");
  if (action === "add-row") addRow();
  if (action === "import-csv") openCsvDialog();
  if (action === "close-dialog") closeCsvDialog();
});

/* CSV: apply button */
csvApply.addEventListener("click", applyCsv);

/* CSV: file upload */
csvFile.addEventListener("change", function () {
  var file = csvFile.files[0];
  if (!file) return;
  uploadName.textContent = file.name;
  var reader = new FileReader();
  reader.onload = function (e) {
    csvText.value = e.target.result;
    csvErrors.className = "dialog-errors";
    csvErrors.textContent = "";
  };
  reader.onerror = function () {
    csvErrors.className = "dialog-errors error";
    csvErrors.textContent = "Failed to read file.";
  };
  reader.readAsText(file);
});

/* CSV: close on overlay click */
csvDialog.addEventListener("click", function (e) {
  if (e.target === csvDialog) closeCsvDialog();
});

/* CSV: Enter in textarea = Apply (no Shift modifier) */
csvText.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    applyCsv();
  }
});

/* ── persistence (sessionStorage) ──────────────────────────────────── */
/* Saves provider rows + usage inputs + budget on every change.
   Survives page refresh; cleared when the tab closes. */

var STORAGE_KEY = "token-calc-state";

function saveState() {
  try {
    var data = {
      rows: rows.map(function (r) {
        return { name: r.name, input: r.input, output: r.output, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite };
      }),
      usage: {
        inTok: inTok.value,
        outTok: outTok.value,
        crTok: crTok.value,
        cwTok: cwTok.value,
        budget: budget.value
      }
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

function restoreState() {
  try {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows)) return false;

    /* restore usage inputs */
    if (data.usage) {
      if (data.usage.inTok != null) inTok.value = data.usage.inTok;
      if (data.usage.outTok != null) outTok.value = data.usage.outTok;
      if (data.usage.crTok != null) crTok.value = data.usage.crTok;
      if (data.usage.cwTok != null) cwTok.value = data.usage.cwTok;
      if (data.usage.budget != null) budget.value = data.usage.budget;
    }

    /* restore rows with fresh ids */
    rows = [];
    for (var i = 0; i < data.rows.length; i++) {
      var r = data.rows[i];
      if (!r || typeof r.name !== "string") continue;
      rows.push({
        id: freshId(),
        name: r.name,
        input: parsePrice(r.input),
        output: parsePrice(r.output),
        cacheRead: parsePrice(r.cacheRead),
        cacheWrite: parsePrice(r.cacheWrite)
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* ── init ──────────────────────────────────────────────────────────── */

rows = [];
if (!restoreState()) {
  for (var i = 0; i < DEFAULT_ROWS.length; i++) {
    rows.push({ id: freshId(), name: DEFAULT_ROWS[i].name, input: DEFAULT_ROWS[i].input, output: DEFAULT_ROWS[i].output, cacheRead: DEFAULT_ROWS[i].cacheRead, cacheWrite: DEFAULT_ROWS[i].cacheWrite });
  }
}
renderPriceRows();
recalc();
