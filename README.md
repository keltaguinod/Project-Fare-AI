# 🚍 BiyaheOffline

**A zero-load, offline-first PWA commuter copilot for Filipino students.**
Ask in messy Taglish — *"Galing ako Cubao, papuntang UP, magkano?"* — and get the exact
jeepney to ride, the distance, and the **legally correct student fare**, even in Airplane Mode.

> Cloud navigation and cloud AI assistants die the moment your prepaid load expires or you
> hit an LRT-underpass dead zone. BiyaheOffline runs the **entire AI + the math on the
> device**, so it keeps working with no internet at all.

---

## What makes it work: Code guarantees, AI translates

The system is split into two layers on purpose, so the AI can **never** hallucinate a fare
and ruin the live demo.

| Layer | Runs | Job | Can it invent numbers? |
|---|---|---|---|
| **A — Deterministic Engine** | plain JavaScript | routing + exact LTFRB fare math | **No.** Hardcoded. |
| **B — Local AI Brain** | WebLLM on WebGPU, in-browser | read Taglish → `{origin, destination}`, then word the reply | Numbers are validated & stripped if changed |

The AI **never calculates the fare**. It only (1) extracts where you're coming from and
going to, and (2) phrases the engine's facts into a warm Taglish sentence. Every number it
writes is checked against the engine and the reply is thrown away if a single digit was
altered (`isReplySafe` in `src/ai/ai.js`).

### Local vs. internet (the submission's Architecture Explanation)

| Runs 100% locally (works in Airplane Mode) | Needs internet (one time only) |
|---|---|
| Route selection & fare math (Layer A) | First download of the app shell (over Wi-Fi) |
| LLM inference — Taglish parsing & reply (Layer B, WebGPU) | First download of the AI model weights (cached forever after) |
| **Place lookup for *any* PH location (bundled offline gazetteer)** | — |
| GPS origin ("use my location") + "Gising-Drop" drop-off alarm (satellite, no data) | — |
| App launch, UI, Service Worker cache | — |

After the first Wi-Fi visit, **nothing** touches the network.

---

## The two killer offline features

1. **Service-Worker PWA** — on the first Wi-Fi visit the whole app shell is cached to the
   phone. From then on it opens and runs natively with no connection. (The ~hundreds-of-MB
   model weights are **not** double-cached by the Service Worker — WebLLM stores them in its
   own Cache Storage; see `vite.config.js`.)
2. **Airplane-Mode Geolocation Alarm ("Gising-Drop")** — a phone's GPS talks straight to
   orbital satellites, bypassing cell towers and data. We watch the position with the HTML5
   Geolocation API and fire a **heavy haptic vibration ~300 m before the destination** so an
   exhausted student never sleeps past their stop. (`src/geo/alarm.js`)

### GPS origin — "I just boarded"

Tap the **📍** button (or pick "Lokasyon ko ngayon" when asked for the origin) and the app uses
the phone's **satellite GPS** as your starting point — no typing needed. You then just search the
**destination**, and the fare is computed from the distance. Works offline (GPS needs no data).

---

## Works anywhere: type any two places

You are **not** limited to the 5 demo lines. Type any two Philippine places —
*"galing Marikina papuntang Pasig"*, *"taga Antipolo, pupunta Makati"*, even
*"Cebu City to Mandaue"* — and BiyaheOffline resolves both via a **bundled offline
gazetteer** (~45k places from GeoNames: cities, towns, barangays, schools,
hospitals, markets, airports, stations) and returns a fare. Two cases:

- **Exact route** — when both ends are known jeepney stops: real signboard, transfers, exact fare.
- **Estimate** — for anywhere else: distance = great-circle × a ~1.3 road-detour factor, then the
  deterministic LTFRB fare, clearly labelled *"tinatayang pamasahe (estimate)"* with a jeep-type
  toggle. Ambiguous names (e.g. "Pasig") resolve to the most populous match, with the rest offered
  as "did you mean" candidates.

The place → coordinates step is **100% offline** (the gazetteer is cached by the Service Worker).
The AI still only *extracts the two names* from messy Taglish; distance and fare always come from
geography + the fare table, never the model. Rebuild the dataset with `npm run gazetteer` (see
`scripts/build-gazetteer.mjs`).

## Project structure

```
biyahe-ai/
├─ index.html                 App shell (mobile-first PWA)
├─ vite.config.js             Vite + vite-plugin-pwa (SW excludes the model weights)
├─ src/
│  ├─ main.js                 UI orchestration: wires AI + engine + gazetteer + GPS (Dev 3)
│  ├─ trip.js                 "Anywhere" orchestrator: known route OR distance estimate
│  ├─ style.css               Mobile UI
│  ├─ engine/                 ── LAYER A: deterministic, zero AI (Dev 1) ──
│  │  ├─ fares.js             Exact LTFRB fare math (new rates, eff. Sep 28 2026)
│  │  ├─ routes.js            The 5 core jeepney lines + distances
│  │  └─ engine.js            plan(origin, dest) → route + fare (direct & 1-transfer)
│  ├─ ai/                     ── LAYER B: local AI pipeline (Dev 2) ──
│  │  ├─ stops.js             Known stops, nicknames, and GPS coordinates
│  │  ├─ matcher.js           Instant rule-based Taglish matcher (<1 ms, no AI)
│  │  └─ ai.js                WebGPU check, model load, parseQuery(), friendlyReply()
│  └─ geo/
│     ├─ alarm.js             Offline GPS: one-shot locate() + "Gising-Drop" drop-off alarm
│     └─ gazetteer.js         Offline PH place lookup (~45k places → coordinates)
├─ public/
│  ├─ favicon.svg             App icon (vector)
│  ├─ icons/icon-{192,512}.png
│  └─ data/ph-places.json     Bundled offline gazetteer (GeoNames PH, CC BY 4.0)
├─ scripts/
│  ├─ generate-icons.mjs      Regenerate PNG icons (pure Node, no deps)
│  └─ build-gazetteer.mjs     Rebuild ph-places.json from the GeoNames PH dump
├─ tests/                     Node tests, no GPU needed — 271/271
│  ├─ matcher.test.mjs        15  — rule-based parsing
│  ├─ engine.test.mjs         29  — fares spot-checked + routing + GPS math
│  ├─ faretable.test.mjs      200 — EVERY km 1..50 (both types, regular+student) vs the official table
│  ├─ trip.test.mjs           17  — gazetteer resolution, free-text extraction, estimates
│  ├─ ai.test.mjs             10  — JSON safety, rules-vs-AI, reply number-guard
│  ├─ fixtures/               ltfrb-new-fare-2026.json — official table extracted from the PDFs
│  └─ stub/                   A fake @mlc-ai/web-llm so the AI tests run headless
├─ ai-test.html               Dev harness: load a model on a phone, run the Taglish test set
└─ README-AI.md               Layer B deep-dive (Developer 2)
```

---

## Run it

```bash
npm install
npm run dev -- --host     # http://localhost:5173  (and http://<laptop-ip>:5173 for the phone)
npm test                  # matcher + engine + AI pipeline, all headless
npm run build             # production build → dist/
npm run preview --host    # serve the built PWA
```

> **WebGPU needs a secure context.** `localhost` is secure on the laptop. For the **phone**,
> use the deployed HTTPS URL (below) or Chrome `chrome://inspect` port-forwarding. Without
> WebGPU the app still fully works via the rule-based matcher + fare engine — only the
> conversational AI phrasing is skipped.

### Deploy

- **GitHub Pages** (served under a sub-path): `npm run build` then publish `dist/`. The base
  is preset to `/biyahe-ai/` in `vite.config.js`.
- **Vercel / Netlify** (served at root): `BASE=/ npm run build`.

---

## About the "model" — what we use and how we chose it

We do **not** train a model from scratch (infeasible and unnecessary for on-device inference).
Instead we run a **pre-trained open-weights small language model locally** via
[WebLLM](https://github.com/mlc-ai/web-llm) on **WebGPU**, and we engineer it for the task:

- **Model:** `Qwen2.5-1.5B-Instruct` (default) — strong Taglish; alternatives
  `Llama-3.2-1B-Instruct` and `Qwen2.5-0.5B-Instruct` for weaker phones. On devices without
  `shader-f16` the loader auto-switches to the `q4f32_1` build.
- **"Training" = prompt engineering + eval-driven selection.** The behaviour is shaped by a
  constrained, few-shot system prompt (`EXTRACT_SYSTEM_PROMPT` in `src/ai/ai.js`) that forces
  JSON-only output and a fixed place list, plus a safety layer that rejects any invented
  place or altered number.
- **Evaluation harness:** `ai-test.html` runs a labelled Taglish test set on the phone and
  reports accuracy, latency, and how many queries were solved by rules vs. the AI. Pick the
  model with the best score at acceptable speed and record its exact ID on the form.

This is why the product **benefits from local AI**: cloud transit apps are physically unusable
in a dead zone or when load expires. On-device inference is the only viable approach — and by
keeping the math deterministic, correctness is guaranteed regardless of the model.

---

## Fare source of truth

Hardcoded from the official **LTFRB General Fare Guides, NEW FARE RATE, effective
September 28 2026** (`Traditional PUJ.pdf`, `Modern PUJ.pdf`), validated by `engine.test.mjs`:

| | First 4 km | Each succeeding km | Student / Elderly / PWD (−20%) | Rounding |
|---|---|---|---|---|
| **Traditional PUJ** | ₱14.00 | +₱2.00 | ₱11.20 + ₱1.60/km | nearest ₱0.25 |
| **Modern / Aircon / E-PUJ** | ₱17.00 | +₱2.40 | ₱13.60 + ₱1.92/km | nearest ₱0.25 |

Multi-ride (transfer) trips sum each leg's fare, since each jeepney ride is charged separately.

---

## Demo / proof video script (< 3 min)

1. Open the app on the phone over Wi-Fi; open the **✨ menu** beside the send box → **Load AI**, wait for "on".
2. **Turn on Airplane Mode** on camera — show the network chip flip to *✈ Offline-ready*.
3. Fully close and reopen Chrome → the PWA still opens (Service Worker).
4. Type a Taglish destination (or "from X to Y") → show the **instant** fare, computed on-device.
5. Tap **📍** to use your live GPS as the origin → search a destination → fare, still offline.
6. On a route card, tap **Gising-Drop Alarm** → show the live GPS distance counting down.

---

## Open-source disclosures (for the submission form)

- **WebLLM** (MLC AI) — in-browser LLM runtime. _open source_
- **WebGPU** — browser GPU inference API.
- **Model:** `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (or the `Llama-3.2-1B-Instruct` / `Qwen2.5-0.5B` variant actually demoed). _open weights_
- **Vite** + **vite-plugin-pwa (Workbox)** — build & Service Worker. _open source_
- **Data:** place gazetteer derived from **GeoNames** (Philippines), licensed **CC BY 4.0** — https://www.geonames.org/
- **AI coding tool:** Claude Code (Anthropic) assisted development.
- All fare, distance & route math is **deterministic JavaScript**, not AI.

---

## Team

| Dev | Area | Code |
|---|---|---|
| **Nicole** | Layer A — routing & fare math | `src/engine/*` |
| **JM** | Layer B — local AI pipeline | `src/ai/*` |
| **Hassan** | Frontend, PWA Service Worker, GPS alarm, submission | `index.html`, `src/main.js`, `src/geo/*`, `vite.config.js` |

> Nicole's 6 original corridors (Fairview–Philcoa, Cubao–Quiapo, Taft–Baclaran, Cubao–Ortigas,
> Pasig–Quiapo, Morayta–Quiapo) are unified into the single engine at `src/engine/` — one
> canonical Layer A, verified against the official LTFRB table (eff. Sep 28 2026).
