# Repository Guidelines

## Project Overview

**TokenCalc** — a single-page HTML/JS/CSS tool for comparing LLM provider pricing. Users paste provider prices (USD per 1M tokens) into a table, set their typical token usage per request (input, output, cache read, cache write), enter a budget, and instantly see cost per request, requests per dollar, and tokens per dollar across all providers, sorted cheapest-first.

## Architecture & Data Flow

The entire application is three static files served from the file system — no build step, no runtime, no server.

```
index.html  →  structure (header, 4 card sections, footer)
styles.css  →  design tokens & layout (mirrors riyaldi.dev)
app.js      →  all logic: state, rendering, event wiring
```

**Data flow:**
1. User edits pricing table rows or usage assumption inputs.
2. Every `input` event triggers `recalc()`.
3. `recalc()` calls `syncFromDom()` to read every price input into the `rows[]` state array, then `saveState()` to persist.
4. `recalc()` computes `costPerRequest = (inTok·P_in + outTok·P_out + crTok·P_cr + cwTok·P_cw) / 1_000_000`, then `requests = budget / cost`, `tokens = requests · perReqTokens`.
5. Results are sorted by cost ascending and rendered into the comparison table.

**State is the single source of truth** — `rows[]` is written by `syncFromDom()` on every recalculation, and add/remove mutate `rows[]` directly then re-render the pricing table.

**Persistence** — provider rows, usage inputs, and budget are saved to `sessionStorage` under `token-calc-state` on every change (`saveState()` inside `recalc()`). Survives page refresh within the same tab; cleared when the tab closes. Restored in init via `restoreState()`; falls back to `DEFAULT_ROWS` when storage is empty/unavailable.

## Key Directories

```
./
├── index.html      Entry point
├── styles.css      All styling
└── app.js          All logic
```

No subdirectories, no build artifacts, no `node_modules`.

## Development Commands

The project has zero tooling. "Run" means opening the file in a browser:

```sh
# Open in default browser
open index.html

# Or serve with any static server
python3 -m http.server 8080
# then visit http://127.0.0.1:8080
```

There are no test, lint, or build commands.

## Code Conventions & Common Patterns

### Formatting
- Double quotes for strings (`"use strict"`, `"price-body"`).
- Single-line `function` declarations preferred over arrow functions for hot paths to avoid per-call allocations.
- `var` used throughout (no `let`/`const` in loop bodies or function-scoped variables). The code predates strict ES6-only conventions.
- Semicolons required.
- Block comments with `/* ── title ── */` pattern for section dividers.

### Naming
- `camelCase` for variables and functions.
- `UPPER_SNAKE` for constants (`M`, `DEFAULT_ROWS`, `SAMPLE_ROWS`).
- DOM element IDs use kebab-case (`#price-body`, `#in-tok`).
- `data-field` attributes use camelCase (`"cacheRead"`, `"cacheWrite"`).
- `data-action` attributes use kebab-case (`"add-row"`, `"load-sample"`).

### Error Handling
- All user input is parsed defensively: `parsePrice()` handles empty strings, `"FREE"`, `"N/A"`, `"—"`, and currency symbols gracefully.
- Number inputs use `Math.max(0, parseInt(...) || 0)` to reject negatives and NaN.
- No try/catch — the computation is purely arithmetic and DOM querying; no external calls.

### Event Wiring
- **Event delegation** is the pattern: one `input` listener on `#price-body` (not one per cell), one `click` listener on `document` for `[data-action]` buttons.
- Usage assumption inputs (`#in-tok`, `#out-tok`, etc.) get individual listeners since they're outside the delegation scope.
- The `remove-btn` delegates up through `priceBody` by checking `data-action="remove-row"` + `data-id`.

### State Management
- Global `rows[]` array holds all pricing rows as `{ id, name, input, output, cacheRead, cacheWrite }`.
- `nextId` counter for unique row IDs (integer, no `crypto.randomUUID`).
- `renderPriceRows()` / `syncFromDom()` is the sync loop: render DOM → user edits → sync state from DOM → recalc → render results.

## Important Files

All three files are equally important — the project is small enough that each carries a third of the application:

| File | Role |
|---|---|
| `index.html` | Entry point, layout structure, all UI sections |
| `styles.css` | Design system (design tokens, card/button/input primitives, responsive breakpoints) |
| `app.js` | State, rendering, formatting, parsing, event wiring, initialization |

There is no config file, no build file, no test file.

## Runtime/Tooling Preferences

- **No runtime required.** Runs in any modern browser. ES6 features used: `const`/`let`, `for...of`, arrow functions, template literals.
- **No package manager.** Zero dependencies. The stylesheet imports `Plus Jakarta Sans` from Google Fonts via `@import url(...)`.
- **No build step.** Open `index.html` directly in the browser.

## Testing & QA

- **No test framework.** Verification is manual: open the page, change inputs, confirm results match manual calculation.
- **Expected math** (for manual verification):
  ```
  costPerRequest = (inTok·P_in + outTok·P_out + crTok·P_cr + cwTok·P_cw) / 1_000_000
  requestsPerBudget = budget / costPerRequest
  tokensPerBudget = requestsPerBudget · (inTok + outTok + crTok + cwTok)
  ```
  Default example: 800 in / 200 out / 50K cache read with OpenInference ($0.03/$0.16/$0.013) → `(24 + 32 + 650)/1e6 = $0.000706/req` → 14,164 req for $10 → 722.4M tokens.

- **Price parsing edge cases:** empty string, `"FREE"`, `"N/A"`, `"—"`, `"-"` all parse to `0`. Dollar signs and commas are stripped.