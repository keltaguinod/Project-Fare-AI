// gazetteer.js — offline Philippines place lookup.
//
// Loads the bundled GeoNames-derived dataset (public/data/ph-places.json, ~45k
// places) once, lazily, and resolves any typed place name → coordinates with NO
// network. This is what lets BiyaheOffline estimate a fare for ANY place, not
// just the 5 hardcoded jeepney lines.
//
// Matching is normalized (case/accents/punctuation-insensitive) and ranked:
// exact name beats prefix beats substring; ties broken by population so a bare
// "San Isidro" resolves to the biggest one, with the rest offered as candidates.

import { normalize } from "../ai/matcher.js";

let RAW = null; // the parsed dataset
let NORM = null; // normalized name per place (parallel array)
let EXACT = null; // Map<normalizedName, number[]> for O(1) exact hits
let loadPromise = null;

/** Default loader: fetch the bundled JSON (base-path aware). Overridable for tests. */
async function defaultProvider() {
  const base = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
  const res = await fetch(base + "data/ph-places.json");
  if (!res.ok) throw new Error("Hindi ma-load ang places dataset.");
  return res.json();
}

// People type "Pasig", GeoNames stores "Pasig City"; treat them as the same key
// so a bare city name resolves to the real city, not a same-named barangay.
function baseKey(n) {
  return n
    .replace(/^(city|municipality) of /, "")
    .replace(/ (city|town)$/, "")
    .trim();
}

function addExact(key, i) {
  const bucket = EXACT.get(key);
  if (bucket) {
    if (!bucket.includes(i)) bucket.push(i);
  } else EXACT.set(key, [i]);
}

/** Build the in-memory indexes from a parsed dataset object. */
export function initGazetteer(data) {
  RAW = data;
  NORM = new Array(data.places.length);
  EXACT = new Map();
  for (let i = 0; i < data.places.length; i++) {
    const n = normalize(data.places[i][0]);
    NORM[i] = n;
    addExact(n, i);
    const b = baseKey(n);
    if (b && b !== n) addExact(b, i); // "Pasig City" also answers "pasig"
  }
  return RAW;
}

/** Lazy-load + index the dataset (runs once). */
export async function loadGazetteer(provider = defaultProvider) {
  if (RAW) return RAW;
  if (!loadPromise) loadPromise = Promise.resolve(provider()).then(initGazetteer);
  return loadPromise;
}

export function isLoaded() {
  return RAW !== null;
}

function entry(i) {
  const [name, lat, lng, admin1, pop] = RAW.places[i];
  return { name, lat, lng, pop, region: RAW.regions?.[admin1] || "", admin1 };
}

/**
 * Resolve a typed place name.
 * @returns {{ best: object|null, candidates: object[] }}
 *   best = top match (or null if nothing plausible); candidates = ranked list
 *   (includes best) for a "did you mean" picker.
 */
export function resolvePlace(text, { limit = 6 } = {}) {
  if (!RAW) throw new Error("Gazetteer not loaded — call loadGazetteer() first.");
  const q = normalize(text);
  if (!q || q.length < 2) return { best: null, candidates: [] };

  const scored = new Map(); // index -> score (higher = better)
  const add = (i, score) => {
    const prev = scored.get(i);
    if (prev == null || score > prev) scored.set(i, score);
  };

  // 1. exact match, incl. city-name equivalence ("pasig" ↔ "Pasig City").
  //    Among exact hits, population breaks the tie (big city > same-named barangay).
  const qBase = baseKey(q);
  for (const i of EXACT.get(q) || []) add(i, 1000);
  for (const i of EXACT.get(qBase) || []) add(i, 1000);

  // 2. prefix + substring scan (word-boundary aware)
  if (scored.size < limit * 4) {
    for (let i = 0; i < NORM.length; i++) {
      const n = NORM[i];
      if (n === q) continue; // already scored exact
      if (n.startsWith(q + " ")) add(i, 700);
      else if (q.startsWith(n + " ")) add(i, 650);
      else if (n.startsWith(q)) add(i, 600);
      else if (n.includes(" " + q + " ") || n.endsWith(" " + q)) add(i, 500);
      else if (q.length >= 4 && n.includes(q)) add(i, 300);
    }
  }

  if (scored.size === 0) return { best: null, candidates: [] };

  const ranked = [...scored.entries()]
    .map(([i, score]) => ({ i, score, pop: RAW.places[i][4], len: NORM[i].length }))
    .sort((a, b) => b.score - a.score || b.pop - a.pop || a.len - b.len)
    .slice(0, limit)
    .map((r) => entry(r.i));

  return { best: ranked[0], candidates: ranked };
}

/** Prefix search for a typeahead picker. */
export function searchPlaces(text, limit = 8) {
  return resolvePlace(text, { limit }).candidates;
}
