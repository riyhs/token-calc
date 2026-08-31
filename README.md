# TokenCalc

Compare LLM provider pricing per 1M tokens. Paste prices into a table, set your typical usage per request, and instantly see cost per request, requests per dollar, and tokens per dollar across all providers — sorted cheapest-first.

## Quick start

No build step, no runtime, no dependencies. Open the file in any browser:

```sh
open index.html
```

Or serve with a static server:

```sh
python3 -m http.server 8080
# → http://localhost:8080
```

## Usage

1. **Add providers** — type provider names and prices (USD per 1M tokens) into the table, or import a CSV.
2. **Set assumptions** — how many input, output, and cache tokens per request, and your budget.
3. **Compare** — results update instantly, sorted cheapest-first.

### CSV import

The import dialog accepts comma-separated values with optional headers. Each row: `Name, Input price, Output price, Cache read price, Cache write price`.

```
OpenInference, 0.03, 0.16, 0.013, 0
```

Headers (first column = `name`/`provider`/`model`) are auto-detected and skipped. Angle brackets are rejected — names are HTML-escaped on render.

## Math

```
costPerRequest = (inTok · P_in + outTok · P_out + crTok · P_cr + cwTok · P_cw) / 1_000_000
requestsPerBudget = budget / costPerRequest
tokensPerBudget = requestsPerBudget · (inTok + outTok + crTok + cwTok)
```

## Files

| File | Role |
|---|---|
| `index.html` | Entry point, layout structure |
| `styles.css` | Design tokens, layout, responsive cards |
| `app.js` | State, rendering, persistence, event wiring |
| `favicon.svg` | Brand icon (white T monogram) |

## Features

- **Zero dependencies** — no npm, no build, no server. Works in any modern browser.
- **sessionStorage persistence** — provider rows, usage inputs, and budget survive page refresh within the same tab. Cleared when the tab closes.
- **Responsive** — standard tables on desktop; stacked card layout on phones (≤720px) with no horizontal scrolling.
- **CSV import** — parse and validate provider pricing in bulk. XSS-safe (angle brackets rejected, names HTML-escaped).
- **Content Security Policy** — strict CSP meta tag blocks inline scripts, eval, and external resources except Google Fonts.
- **Accessibility** — keyboard navigation, focus trap in dialog, focus-visible rings, `inert` on background, screen-reader labels, reduced-motion support.
- **Animation** — enter/leave transitions on add/remove provider rows (200ms ease-out, GPU-only properties).

## Security

The app is a static page with no server, no network requests, and no user data crossing trust boundaries. Key controls:

- All user-provided text is HTML-escaped via `esc()` before insertion into `innerHTML`.
- A `Content-Security-Policy` meta tag enforces strict resource loading.
- CSV import rejects angle brackets and validates price ranges.
- `sessionStorage` is same-origin only and cleared on tab close.

## License

© 2026 Riyaldi Hasan · [riyaldi.dev](https://riyaldi.dev)