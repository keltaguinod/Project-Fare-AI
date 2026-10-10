// matcher.js — fast, deterministic Taglish place matcher (no AI needed).
// Runs first on every query. Most demo questions are answered here in <1 ms,
// so the AI is only used for messy questions this matcher cannot resolve.
// Also used to validate whatever the AI returns (the AI can only ever hand
// back a stop that exists in STOPS).

import { STOPS } from "./stops.js";

// Single words that mean "I am FROM here".
const ORIGIN_WORDS = new Set([
  "galing", "mula", "from", "nasa", "andito", "nandito", "dito", "narito",
  "in", "at", "starting", "start", "sakay", "sasakay", "sumakay", "umalis",
]);

// Single words that mean "I am going TO here".
const DEST_WORDS = new Set([
  "papunta", "papuntang", "pupunta", "punta", "puntang", "pumunta", "patungo",
  "patungong", "to", "hanggang", "baba", "bababa", "ibaba", "bumaba",
  "destination", "uuwi", "uwi", "towards", "bound", "going",
]);

/** Lowercase, strip accents/punctuation, collapse spaces. */
export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/u\.\s?p\.?/g, "up")
    .replace(/u\.\s?s\.\s?t\.?/g, "ust")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pre-compute aliases, longest first (so "sm north edsa" wins over "north edsa").
const ALIASES = STOPS.flatMap((stop) =>
  stop.aliases.map((a) => ({ alias: normalize(a), stop }))
).sort((a, b) => b.alias.length - a.alias.length);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find every known place in the text, with its position. */
export function findStops(text) {
  let t = ` ${normalize(text)} `;
  const found = [];
  for (const { alias, stop } of ALIASES) {
    const re = new RegExp(` ${escapeRe(alias)} `, "g");
    let m;
    while ((m = re.exec(t)) !== null) {
      // "up" is also an English word: ignore "pick up", "wake up", "up to" etc.
      if (alias === "up") {
        const before = t.slice(0, m.index).trim().split(" ").pop();
        const after = t.slice(m.index + m[0].length).trim().split(" ")[0];
        if (["pick", "wake", "gising", "set", "speed", "hurry", "line", "look"].includes(before)) continue;
        if (["to", "until"].includes(after)) continue;
      }
      found.push({ stop, index: m.index, end: m.index + m[0].length });
      // Mask the match so shorter aliases don't match inside it again.
      t = t.slice(0, m.index) + " " + "#".repeat(m[0].length - 2) + " " + t.slice(m.index + m[0].length);
      re.lastIndex = 0;
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

/** Same as findStops but also returns the text with places masked out. */
function scan(text) {
  const hits = findStops(text);
  let masked = ` ${normalize(text)} `;
  for (const h of hits) {
    masked = masked.slice(0, h.index) + " " + "#".repeat(h.end - h.index - 2) + " " + masked.slice(h.end);
  }
  return { hits, masked };
}

/** Look back up to 5 words before a place for a FROM/TO word. */
function roleBefore(masked, index) {
  const words = masked.slice(0, index).trim().split(" ").filter(Boolean);
  for (let i = words.length - 1, n = 0; i >= 0 && n < 5; i--, n++) {
    const w = words[i];
    if (w.startsWith("#")) break; // reached the previous place
    if (DEST_WORDS.has(w)) return "destination";
    if (ORIGIN_WORDS.has(w)) return "origin";
  }
  return null;
}

/**
 * Try to understand a question without AI.
 * Returns { origin, destination, confident } where origin/destination are stop
 * objects or null. `confident` = safe to skip the AI.
 */
export function quickParse(text) {
  const { hits, masked } = scan(text);
  let origin = null;
  let destination = null;

  for (const h of hits) {
    const role = roleBefore(masked, h.index);
    if (role === "origin" && !origin) origin = h.stop;
    else if (role === "destination" && !destination) destination = h.stop;
  }

  // Fill gaps by order: "Cubao UP magkano?" → first = origin, second = destination.
  const unused = hits.filter((h) => h.stop !== origin && h.stop !== destination);
  if (!origin && !destination && unused.length >= 2) {
    origin = unused[0].stop;
    destination = unused[1].stop;
  } else if (origin && !destination && unused.length) {
    destination = unused[0].stop;
  } else if (!origin && destination && unused.length) {
    origin = unused[0].stop;
  }

  if (origin && destination && origin.id === destination.id) destination = null;

  const distinctPlaces = new Set(hits.map((h) => h.stop.id)).size;
  const confident = Boolean(origin && destination) && distinctPlaces === 2;
  return { origin, destination, confident };
}

/** Map any free text the AI returned (e.g. "U.P.", "Araneta") to a known stop. */
export function resolveStop(value) {
  if (!value || typeof value !== "string") return null;
  const v = normalize(value);
  if (!v || v === "null" || v === "unknown" || v === "none") return null;
  const byId = STOPS.find((s) => s.id === v.replace(/ /g, "_"));
  if (byId) return byId;
  const hits = findStops(value);
  return hits.length === 1 ? hits[0].stop : null;
}
