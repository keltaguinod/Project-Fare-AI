// ai.js — BiyaheOffline local AI pipeline (Developer 2).
//
// Job of this module (and ONLY this):
//   1. Load a small language model in the browser with WebLLM + WebGPU.
//   2. Read a messy Taglish question and return { origin, destination } as
//      stop ids from stops.js.
//   3. Turn the routing engine's result into a short, friendly Taglish reply.
//
// The AI NEVER computes fares or picks routes. Developer 1's engine does that.
//
// Install:  npm install @mlc-ai/web-llm

import { STOPS, STOP_BY_ID } from "./stops.js";
import { quickParse, resolveStop } from "./matcher.js";

// WebLLM is several MB of JavaScript. Load it lazily so the PWA shell opens
// instantly offline; the library (and then the model) is only fetched when the
// user actually taps "Load AI".
let webllm = null;
async function getWebLLM() {
  webllm ??= await import("@mlc-ai/web-llm");
  return webllm;
}

// ---------------------------------------------------------------------------
// Model choice. Test both on the DEMO PHONE, keep the one that parses the
// Taglish test set best at an acceptable speed, then write its exact ID in
// the disclosures form.
// ---------------------------------------------------------------------------
export const MODELS = {
  qwen15: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", // better Taglish, ~1 GB download
  llama1b: "Llama-3.2-1B-Instruct-q4f16_1-MLC", // smaller/faster, weaker Taglish
  qwen05: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", // emergency fallback for weak phones
};
export let MODEL_ID = MODELS.qwen15;

let engine = null;
let loading = null;

// ---------------------------------------------------------------------------
// 1. WebGPU + model loading
// ---------------------------------------------------------------------------

/** Check if this browser can run WebLLM at all. */
export async function checkWebGPU() {
  if (!("gpu" in navigator)) {
    return { ok: false, reason: "This browser has no WebGPU. Use Chrome on Android (version 121+) or desktop Chrome/Edge." };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "WebGPU is present but no GPU adapter was found on this device." };
    const f16 = adapter.features.has("shader-f16");
    return { ok: true, shaderF16: f16 };
  } catch (e) {
    return { ok: false, reason: "WebGPU error: " + e.message };
  }
}

/** True if the model is already saved on the phone (works in airplane mode). */
export async function isModelCached(modelId = MODEL_ID) {
  try {
    const w = await getWebLLM();
    return await w.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/**
 * Load the model. First time: downloads over Wi-Fi and caches it.
 * After that: loads from the phone's storage, no internet needed.
 * onProgress receives { progress: 0..1, text }.
 */
export async function loadModel({ modelId, onProgress } = {}) {
  if (engine) return engine;
  if (loading) return loading;

  const gpu = await checkWebGPU();
  if (!gpu.ok) throw new Error(gpu.reason);

  // Phones without shader-f16 need the q4f32 build of the same model.
  MODEL_ID = modelId || MODEL_ID;
  if (!gpu.shaderF16) MODEL_ID = MODEL_ID.replace("q4f16_1", "q4f32_1");

  // Ask the browser not to delete the ~1 GB model when storage runs low.
  try {
    await navigator.storage?.persist?.();
  } catch {}

  const t0 = performance.now();
  const w = await getWebLLM();
  loading = w
    .CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (r) => onProgress?.({ progress: r.progress, text: r.text }),
    })
    .then((e) => {
      engine = e;
      stats.loadMs = Math.round(performance.now() - t0);
      stats.model = MODEL_ID;
      return e;
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

export function isReady() {
  return engine !== null;
}

/** Numbers for the "Offline Proof" panel and the pitch. */
export const stats = { model: null, loadMs: null, lastParseMs: null, lastParseSource: null, lastReplyMs: null };

// ---------------------------------------------------------------------------
// 2. Taglish → origin / destination
// ---------------------------------------------------------------------------

const STOP_LIST = STOPS.map((s) => `- ${s.id}: ${s.name} (also called: ${s.aliases.slice(0, 5).join(", ")})`).join("\n");

export const EXTRACT_SYSTEM_PROMPT = `You are the location reader of BiyaheOffline, a commute app for Filipino students.
The user writes in English, Tagalog, or Taglish. Your ONLY job is to find where the user is coming FROM (origin) and where they are GOING (destination).

Known places (use the id on the left):
${STOP_LIST}

Rules:
1. Reply with JSON only, exactly: {"origin": "<id or null>", "destination": "<id or null>"}
2. Use only ids from the list above. If a place is not in the list or not mentioned, use null.
3. Origin words: galing, mula, from, nasa, andito, nandito, sakay ako sa, I'm in, I'm at.
4. Destination words: papunta, papuntang, pupunta, punta, hanggang, uuwi sa, baba sa, ibaba mo ako sa, to, going to.
5. If two places are given with no clue words, the first is the origin and the second is the destination.
6. Never compute fares, never explain, never add other keys.

Examples:
User: Galing ako Cubao, papuntang UP, magkano?
{"origin": "cubao", "destination": "up_diliman"}
User: pauwi na ko sa Philcoa from Quiapo, anong jeep?
{"origin": "quiapo", "destination": "philcoa"}
User: nasa Trinoma ako, gusto ko pumunta Katipunan
{"origin": "sm_north", "destination": "katipunan"}
User: paano pumunta ng UST?
{"origin": null, "destination": "espana_ust"}
User: magkano pamasahe papuntang Makati?
{"origin": null, "destination": null}`;

async function askModelForPlaces(question) {
  const reply = await engine.chat.completions.create({
    messages: [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    temperature: 0,
    max_tokens: 48,
    response_format: { type: "json_object" },
  });
  return parseModelJSON(reply.choices[0]?.message?.content);
}

// Free-text extractor for the "anywhere" flow: the model returns the two place
// NAMES as the user wrote them (any Philippine place, not a fixed list). The
// gazetteer, not the model, turns those names into coordinates.
export const EXTRACT_FREETEXT_PROMPT = `You read a Filipino commuter's message (English/Tagalog/Taglish) and pull out exactly two things: the place they are coming FROM (origin) and the place they are GOING TO (destination). These can be ANY place in the Philippines — city, town, barangay, school, mall, landmark.
Reply with JSON only: {"origin": "<place text or null>", "destination": "<place text or null>"}
- Copy the place names as the user wrote them (you may drop filler words like "magkano", "po", "jeep").
- Origin clue words: galing, mula, from, nasa, andito, sakay ako sa. Destination clue words: papunta, papuntang, punta, hanggang, uuwi sa, to, going to.
- If a place is not mentioned, use null. Never invent a place. No other keys, no explanation.
Examples:
User: Galing ako Marikina papuntang Pasig, magkano? -> {"origin":"Marikina","destination":"Pasig"}
User: papunta akong SM Megamall -> {"origin":null,"destination":"SM Megamall"}
User: taga Antipolo ako, pupunta Cubao -> {"origin":"Antipolo","destination":"Cubao"}`;

/**
 * AI fallback for trip.js: extract raw origin/destination place strings.
 * Returns { origin: string|null, destination: string|null }. Safe to call only
 * when the model is loaded (isReady()); throws otherwise so the caller falls back.
 */
export async function extractTripText(question) {
  if (!engine) throw new Error("AI not loaded");
  const reply = await engine.chat.completions.create({
    messages: [
      { role: "system", content: EXTRACT_FREETEXT_PROMPT },
      { role: "user", content: question },
    ],
    temperature: 0,
    max_tokens: 64,
    response_format: { type: "json_object" },
  });
  const raw = reply.choices[0]?.message?.content;
  const match = String(raw || "").match(/\{[\s\S]*\}/);
  try {
    const obj = JSON.parse(match ? match[0] : raw);
    const clean = (v) => (typeof v === "string" && v.trim() && v.toLowerCase() !== "null" ? v.trim() : null);
    return { origin: clean(obj.origin), destination: clean(obj.destination) };
  } catch {
    return { origin: null, destination: null };
  }
}

/** Pull {origin, destination} out of whatever the model returned, safely. */
export function parseModelJSON(raw) {
  if (!raw) return { origin: null, destination: null };
  const match = String(raw).match(/\{[\s\S]*\}/);
  let obj = {};
  try {
    obj = JSON.parse(match ? match[0] : raw);
  } catch {
    return { origin: null, destination: null };
  }
  // resolveStop() guarantees we only ever return a stop that exists.
  return { origin: resolveStop(obj.origin), destination: resolveStop(obj.destination) };
}

/**
 * MAIN ENTRY POINT for the UI.
 * Returns:
 *   {
 *     origin: {id, name} | null,
 *     destination: {id, name} | null,
 *     source: "rules" | "ai" | "rules+ai",
 *     needsInput: "origin" | "destination" | "both" | null,   // show stop buttons if not null
 *     suggestions: [{id, name}]                                 // buttons for the "Did you mean" picker
 *   }
 */
export async function parseQuery(question) {
  const t0 = performance.now();

  // Step 1: instant rule-based matching (no AI). Handles most demo questions.
  const quick = quickParse(question);
  let origin = quick.origin;
  let destination = quick.destination;
  let source = "rules";

  // Step 2: only ask the AI when the rules were not sure.
  if (!quick.confident && engine) {
    try {
      const ai = await askModelForPlaces(question);
      // Keep what the rules already found; let the AI fill the gaps.
      if (!origin && ai.origin) origin = ai.origin;
      if (!destination && ai.destination) destination = ai.destination;
      // If the rules found nothing at all, trust the AI fully.
      if (!quick.origin && !quick.destination) {
        origin = ai.origin;
        destination = ai.destination;
      }
      source = quick.origin || quick.destination ? "rules+ai" : "ai";
    } catch (err) {
      console.warn("AI parse failed, using rules only:", err);
    }
  }

  if (origin && destination && origin.id === destination.id) destination = null;

  stats.lastParseMs = Math.round(performance.now() - t0);
  stats.lastParseSource = source;

  const needsInput = !origin && !destination ? "both" : !origin ? "origin" : !destination ? "destination" : null;
  return {
    origin: origin ? { id: origin.id, name: origin.name } : null,
    destination: destination ? { id: destination.id, name: destination.name } : null,
    source,
    needsInput,
    suggestions: needsInput ? STOPS.map((s) => ({ id: s.id, name: s.name })) : [],
  };
}

// ---------------------------------------------------------------------------
// 3. Friendly Taglish reply (facts come from Developer 1's engine)
// ---------------------------------------------------------------------------

const REPLY_SYSTEM_PROMPT = `You are BiyaheOffline, a friendly commute buddy for Filipino students.
Write ONE short, warm Taglish reply (max 3 sentences) using ONLY the facts given.
Copy every peso amount, distance, jeep signboard, and place name EXACTLY as given.
Do not add any number, route, or place that is not in the facts. No markdown.`;

/**
 * routeResult = the object returned by Developer 1's engine. Expected fields
 * (rename here if the engine uses different names):
 *   { originName, destinationName, signboard, jeepType: "traditional"|"modern",
 *     transfers: [string], distanceKm, regularFare, studentFare }
 */
export function templateReply(r) {
  const transfer = r.transfers?.length ? ` Lipat ka sa ${r.transfers.join(", tapos sa ")}.` : "";
  return (
    `Sakay ka ng jeep na may signboard na "${r.signboard}" mula ${r.originName} papuntang ${r.destinationName}.` +
    transfer +
    ` Mga ${r.distanceKm} km ang biyahe. Student fare mo: ₱${fmt(r.studentFare)} (regular ₱${fmt(r.regularFare)}). Ingat sa biyahe!`
  );
}

export async function friendlyReply(r) {
  const fallback = templateReply(r);
  if (!engine) return fallback;

  const t0 = performance.now();
  const facts = [
    `From: ${r.originName}`,
    `To: ${r.destinationName}`,
    `Jeep signboard: ${r.signboard}`,
    `Jeep type: ${r.jeepType}`,
    `Transfers: ${r.transfers?.length ? r.transfers.join(", ") : "none"}`,
    `Distance: ${r.distanceKm} km`,
    `Student fare: ₱${fmt(r.studentFare)}`,
    `Regular fare: ₱${fmt(r.regularFare)}`,
  ].join("\n");

  try {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: REPLY_SYSTEM_PROMPT },
        { role: "user", content: facts },
      ],
      temperature: 0.3,
      max_tokens: 120,
    });
    const text = reply.choices[0]?.message?.content?.trim();
    stats.lastReplyMs = Math.round(performance.now() - t0);
    return isReplySafe(text, r) ? text : fallback;
  } catch {
    return fallback;
  }
}

/** Reject any AI reply that invents or changes a number. */
export function isReplySafe(text, r) {
  if (!text || text.length > 400) return false;
  const allowed = new Set(
    [r.studentFare, r.regularFare, r.distanceKm].flatMap((n) => [String(n), fmt(n), String(Number(n))])
  );
  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  // Also allow digits that are part of the signboard / place names (e.g. "168 Mall").
  const namesText = [r.signboard, r.originName, r.destinationName, ...(r.transfers || [])].join(" ");
  const ok = numbers.every((n) => allowed.has(n) || namesText.includes(n));
  const hasFare = text.includes(fmt(r.studentFare)) || text.includes(String(Number(r.studentFare)));
  return ok && hasFare;
}

function fmt(n) {
  return Number(n).toFixed(2);
}

export { STOP_BY_ID };
