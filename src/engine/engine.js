// engine.js — Layer A router (deterministic, zero AI).
//
// Given an origin and destination stop id, pick the jeepney line(s) to ride and
// compute the exact fare. Handles direct lines and single-transfer trips. The
// returned object is EXACTLY the shape the AI pipeline's friendlyReply() expects
// (see src/ai/ai.js): { originName, destinationName, signboard, jeepType,
// transfers, distanceKm, regularFare, studentFare, legs }.

import { STOP_BY_ID } from "../ai/stops.js";
import { LINES, STOP_INDEX } from "./routes.js";
import { computeFare } from "./fares.js";

const nameOf = (id) => STOP_BY_ID[id]?.name ?? id;
const round1 = (n) => Math.round(n * 10) / 10;

/** Build one ride (leg) along a single line between two stops it serves. */
function buildLeg(line, fromId, toId) {
  const from = line.stops.find((s) => s.id === fromId);
  const to = line.stops.find((s) => s.id === toId);
  const distanceKm = round1(Math.abs(from.km - to.km));
  const fare = computeFare(line.type, distanceKm);
  return {
    lineId: line.id,
    signboard: line.signboard,
    jeepType: line.type,
    typeLabel: fare.typeLabel,
    fromId,
    toId,
    fromName: nameOf(fromId),
    toName: nameOf(toId),
    distanceKm,
    chargedKm: fare.chargedKm,
    regularFare: fare.regular,
    studentFare: fare.student,
  };
}

/** A direct line that serves both stops, if one exists. */
function findDirect(originId, destId) {
  for (const line of LINES) {
    const hasO = line.stops.some((s) => s.id === originId);
    const hasD = line.stops.some((s) => s.id === destId);
    if (hasO && hasD) return line;
  }
  return null;
}

/**
 * The shortest single-transfer trip: ride line A from origin to a shared stop T,
 * then line B from T to destination. Returns [legA, legB] or null.
 */
function findOneTransfer(originId, destId) {
  let best = null;
  for (const { line: a } of STOP_INDEX[originId]) {
    for (const t of a.stops) {
      if (t.id === originId || t.id === destId) continue;
      for (const { line: b } of STOP_INDEX[t.id] ?? []) {
        if (b === a) continue;
        if (!b.stops.some((s) => s.id === destId)) continue;
        const legs = [buildLeg(a, originId, t.id), buildLeg(b, t.id, destId)];
        const total = legs[0].distanceKm + legs[1].distanceKm;
        if (!best || total < best.total) best = { legs, total };
      }
    }
  }
  return best?.legs ?? null;
}

/** Assemble legs into the result object the UI + AI reply consume. */
function assemble(originId, destId, legs) {
  const transfers = legs.slice(0, -1).map((leg, i) => {
    const next = legs[i + 1];
    return `${leg.toName}, sakay ng "${next.signboard}" na jeep`;
  });

  const distanceKm = round1(legs.reduce((sum, l) => sum + l.distanceKm, 0));
  const regularFare = legs.reduce((sum, l) => sum + l.regularFare, 0);
  const studentFare = legs.reduce((sum, l) => sum + l.studentFare, 0);
  const types = [...new Set(legs.map((l) => l.jeepType))];

  return {
    originId,
    destinationId: destId,
    originName: nameOf(originId),
    destinationName: nameOf(destId),
    signboard: legs[0].signboard,
    jeepType: types.length === 1 ? types[0] : "mixed",
    transfers,
    distanceKm,
    regularFare,
    studentFare,
    legs,
  };
}

/**
 * MAIN ENTRY POINT for the UI (Developer 1's contract with Developers 2 & 3).
 * @returns route result object, or throws a friendly Error if unroutable.
 */
export function plan(originId, destId) {
  if (!STOP_INDEX[originId]) throw new Error(`Wala sa ruta ang pinanggalingan: ${originId}`);
  if (!STOP_INDEX[destId]) throw new Error(`Wala sa ruta ang destinasyon: ${destId}`);
  if (originId === destId) throw new Error("Pareho ang pinanggalingan at destinasyon.");

  const direct = findDirect(originId, destId);
  if (direct) return assemble(originId, destId, [buildLeg(direct, originId, destId)]);

  const transfer = findOneTransfer(originId, destId);
  if (transfer) return assemble(originId, destId, transfer);

  throw new Error(
    `Pasensya, wala pang direktang ruta mula ${nameOf(originId)} papuntang ${nameOf(destId)} sa 5 demo routes.`
  );
}

/** True if a trip can be planned between two stops (for UI validation). */
export function isRoutable(originId, destId) {
  if (originId === destId || !STOP_INDEX[originId] || !STOP_INDEX[destId]) return false;
  return Boolean(findDirect(originId, destId) || findOneTransfer(originId, destId));
}
