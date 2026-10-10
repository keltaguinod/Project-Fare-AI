# BiyaheOffline: AI Pipeline (Developer 2)

The AI only understands the question and words the answer. It never computes fares or chooses routes.

```
Question (Taglish)
  → matcher.js   instant rule-based matching (no AI, <1 ms)
  → ai.js        only if rules aren't sure: local LLM via WebLLM + WebGPU → JSON
  → resolveStop  rejects any place not in stops.js
  → Developer 1's engine: route + fare
  → friendlyReply: Taglish reply; rejected if any number is changed → template
```

## Files
| File | What it does |
|---|---|
| `src/ai/stops.js` | Known stops + nicknames. **Ids must match Developer 1's route engine.** |
| `src/ai/matcher.js` | Taglish FROM/TO word rules (galing, nasa, papunta, hanggang, baba…). |
| `src/ai/ai.js` | WebGPU check, model loading, system prompt, `parseQuery()`, `friendlyReply()`. |
| `ai-test.html` | Phone test page: load model, try questions, run the test set for pitch numbers. |
| `tests/` | Node tests (no GPU): `npm test` runs matcher (15/15), engine (29/29) and the AI pipeline (10/10). `tests/stub/` is a fake WebLLM so the AI tests run headless. |

## Setup (Vite project)
```bash
npm install                # @mlc-ai/web-llm is already in package.json
npm run dev -- --host      # open http://<laptop-ip>:5173/ai-test.html on the phone
```
`ai.js` loads WebLLM with a lazy `import("@mlc-ai/web-llm")` inside `loadModel()`, so the
~6 MB library is only fetched when the user taps **Load AI** — the PWA shell stays tiny.
WebGPU needs a secure context. `localhost` works on the laptop. For the phone, use the deployed HTTPS URL (GitHub Pages, Vercel or Netlify), or Chrome's `chrome://inspect` port forwarding to `localhost:5173`.

## How the UI uses it (for Developer 3)
```js
import { loadModel, parseQuery, friendlyReply, isModelCached } from "./src/ai/ai.js";

await loadModel({ onProgress: ({ progress, text }) => showBar(progress, text) });

const q = await parseQuery(userText);
if (q.needsInput) {
  showStopButtons(q.suggestions, q.needsInput);   // "Saan ka galing?" / "Saan ka papunta?"
} else {
  const route = engine.plan(q.origin.id, q.destination.id);   // Developer 1
  showAnswer(await friendlyReply(route));
}
```
`friendlyReply` expects: `{ originName, destinationName, signboard, jeepType, transfers, distanceKm, regularFare, studentFare }`. If Developer 1's field names differ, rename them in `templateReply()` and `friendlyReply()`.

## Tonight's checklist
1. **Test WebGPU on the demo phone first** (`ai-test.html`). Chrome on Android 121+ is needed. If WebGPU isn't available, the rules still handle most questions, but the AI part won't run, so use a laptop for the demo.
2. **Choose the model:** run the test set with Qwen2.5 1.5B, then Llama 3.2 1B. Keep the better score at acceptable speed. Write the exact ID shown on screen in the disclosures (on phones without `shader-f16`, it switches to the `q4f32_1` build automatically).
3. **Airplane-mode test:** load once on Wi-Fi → airplane mode → close Chrome fully → reopen → load model → ask. Do this early, not at 9 AM.
4. **Tell Developer 3 (service worker):** don't cache the model files in the service worker (`huggingface.co` and the model `.wasm`). WebLLM already stores them, and caching them twice can fill the phone's storage.
5. **Pitch numbers** to record from the test page: model, load time, test-set score, avg ms, how many were solved by rules vs AI.

## Disclosure text (fill in the final model)
> Local AI: WebLLM (MLC AI, open source) running `<exact model ID>` on WebGPU in the browser. The model is downloaded once and cached on the device; all inference runs locally. Fare and route calculations are deterministic JavaScript, not AI.

## Note
These files were written and tested without a GPU (WebLLM couldn't be installed in the build environment). The matcher, JSON validation and reply safety checks pass in Node with a fake engine. The real model loading must be verified on the phone, which is step 1 above.
