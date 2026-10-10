// trip.js — the "anywhere" orchestrator.
//
// Turns a free-text query (any two Philippine places, not just the 5 demo lines)
// into either:
//   • an EXACT route  — when both ends are known jeepney stops (signboard, transfers), or
//   • an ESTIMATE     — distance from the offline gazetteer × a road-detour factor,
//                       then the deterministic LTFRB fare. Labelled as an estimate.
//
// The AI never computes distance or fare. It (optionally) only helps extract the
// two place names from messy Taglish; the numbers always come from geography +
// the fare table.

import { quickParse, resolveStop, normalize } from "./ai/matcher.js";
import { plan, isRoutable } from "./engine/engine.js";
import { computeFare } from "./engine/fares.js";
import { haversineMeters } from "./geo/alarm.js";
import { loadGazetteer, resolvePlace } from "./geo/gazetteer.js";

// Straight-line → road distance. Jeepneys follow roads, not crow-flight; ~1.3 is
// a common urban detour index. Fares are therefore an estimate, clearly labelled.
export const ROAD_FACTOR = 1.3;

const round1 = (n) => Math.round(n * 10) / 10;

// Cue words, longest first, used to split "galing X papuntang Y".
const DEST_CUES = [
  "papuntang", "papunta sa", "papunta", "pupuntang", "pupunta sa", "pupunta",
  "puntang", "punta sa", "punta", "patungong", "patungo sa", "patungo",
  "going to", "hanggang", "uuwi sa", "uwi sa", "bound for", "to",
];
const ORIGIN_CUES = [
  "galing sa", "galing", "mula sa", "mula", "from", "nandito sa", "andito sa",
  "nasa", "sakay ako sa", "sakay sa", "taga sa", "taga", "dito sa",
];
// Words trimmed from the edges of a captured place phrase.
const FILLER = new Set([
  "magkano", "pamasahe", "fare", "po", "ba", "ako", "ko", "na", "ang", "student",
  "jeep", "jeepney", "anong", "how", "much", "kaya", "ulit", "yung", "yong", "sa",
  "ng", "mo", "kami", "tayo", "daw", "ha", "ride", "the", "is", "pamasahe", "po",
]);

function cleanPhrase(s) {
  let toks = s.split(" ").filter(Boolean);
  while (toks.length && FILLER.has(toks[0])) toks.shift();
  while (toks.length && FILLER.has(toks[toks.length - 1])) toks.pop();
  return toks.join(" ").trim() || null;
}

/** Find the earliest whole-word cue from a list; returns {start,end} or null. */
function firstCue(text, cues) {
  let best = null;
  for (const cue of cues) {
    const idx = text.indexOf(" " + cue + " ");
    if (idx !== -1 && (!best || idx < best.start)) best = { start: idx + 1, end: idx + 1 + cue.length };
  }
  return best;
}

/**
 * Deterministic, offline extraction of origin/destination phrases from a query.
 * @returns {{ originText: string|null, destText: string|null }}
 */
export function extractOriginDest(query) {
  const t = " " + normalize(query) + " ";
  const dest = firstCue(t, DEST_CUES);
  const origin = firstCue(t, ORIGIN_CUES);

  let originText = null;
  let destText = null;

  // text after a cue, up to the next cue (or the end)
  const sliceAfter = (cue) => {
    if (!cue) return null;
    const nextStarts = [dest, origin]
      .filter((c) => c && c.start > cue.end)
      .map((c) => c.start);
    const stop = nextStarts.length ? Math.min(...nextStarts) : t.length;
    return cleanPhrase(t.slice(cue.end, stop).trim());
  };

  if (dest) destText = sliceAfter(dest);
  if (origin) originText = sliceAfter(origin);

  // "X papuntang Y" with no origin cue → everything before the dest cue is origin
  if (dest && !origin) originText = cleanPhrase(t.slice(0, dest.start).trim());

  // No cue words at all → treat the whole phrase as the destination
  // (e.g. the user just types "SM Megamall"); origin is asked next (incl. GPS).
  if (!dest && !origin) destText = cleanPhrase(t.trim());

  return { originText, destText };
}

function stopResolved(stop) {
  return {
    id: stop.id,
    name: stop.name,
    lat: stop.coords.lat,
    lng: stop.coords.lng,
    region: "Metro Manila (NCR)",
    isStop: true,
  };
}

/**
 * Resolve one place phrase to coordinates: known jeepney stop first (keeps the
 * exact-route path), otherwise the offline gazetteer.
 * @returns {{resolved: object|null, candidates: object[]}}
 */
export function resolveAny(text) {
  if (!text) return { resolved: null, candidates: [] };
  const stop = resolveStop(text);
  if (stop) return { resolved: stopResolved(stop), candidates: [] };
  const { best, candidates } = resolvePlace(text);
  if (!best) return { resolved: null, candidates };
  return { resolved: { ...best, isStop: false }, candidates };
}

/** Distance-based fare estimate between two resolved places. */
export function estimateTrip(o, d, type = "traditional") {
  const straightKm = haversineMeters({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng }) / 1000;
  const distanceKm = straightKm * ROAD_FACTOR;
  const fare = computeFare(type, distanceKm);
  return {
    kind: "estimate",
    origin: o,
    destination: d,
    originName: o.name,
    destinationName: d.name,
    originRegion: o.region,
    destRegion: d.region,
    destinationId: d.id || null,
    destCoords: { lat: d.lat, lng: d.lng },
    straightKm: round1(straightKm),
    distanceKm: round1(distanceKm),
    chargedKm: fare.chargedKm,
    jeepType: type,
    typeLabel: fare.typeLabel,
    regularFare: fare.regular,
    studentFare: fare.student,
    roadFactor: ROAD_FACTOR,
  };
}

/** Plan from two already-resolved ends (used by the picker). */
export function planResolved(o, d, type = "traditional") {
  if (o.isStop && d.isStop && isRoutable(o.id, d.id)) {
    return { kind: "route", ...plan(o.id, d.id) };
  }
  return estimateTrip(o, d, type);
}

/**
 * MAIN ENTRY POINT. Resolve a free-text query to a route or an estimate.
 * @param {string} query
 * @param {{type?: "traditional"|"modern", aiExtract?: (q:string)=>Promise<{origin,destination}>}} opts
 * @returns route | estimate | { kind:"need", needs, ...candidates }
 */
export async function planFromQuery(query, opts = {}) {
  const type = opts.type || "traditional";
  await loadGazetteer();

  // 1. Known-stop exact route (the strong demo path).
  const quick = quickParse(query);
  if (quick.confident && isRoutable(quick.origin.id, quick.destination.id)) {
    return { kind: "route", ...plan(quick.origin.id, quick.destination.id) };
  }

  // 2. Free-text extraction (deterministic first, AI only to fill gaps).
  let { originText, destText } = extractOriginDest(query);
  if (!originText && quick.origin) originText = quick.origin.name;
  if (!destText && quick.destination) destText = quick.destination.name;

  if ((!originText || !destText) && typeof opts.aiExtract === "function") {
    try {
      const ai = await opts.aiExtract(query);
      originText = originText || ai?.origin || null;
      destText = destText || ai?.destination || null;
    } catch {
      /* AI is optional; deterministic result stands */
    }
  }

  let o = resolveAny(originText);
  // No typed origin? Fall back to a provided GPS origin ("I just boarded").
  if (!o.resolved && opts.origin) o = { resolved: opts.origin, candidates: [] };
  const d = resolveAny(destText);

  if (!o.resolved || !d.resolved) {
    return {
      kind: "need",
      needs: !o.resolved && !d.resolved ? "both" : !o.resolved ? "origin" : "destination",
      origin: o.resolved,
      destination: d.resolved,
      originText,
      destText,
      originCandidates: o.candidates,
      destCandidates: d.candidates,
    };
  }

  return planResolved(o.resolved, d.resolved, type);
}
