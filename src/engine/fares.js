// fares.js — LTFRB jeepney fare math (Layer A, deterministic, zero AI).
//
// Source of truth: the two official LTFRB "General Fare Guide" tables, NEW FARE
// RATE, EFFECTIVE September 28, 2026 (provided as Traditional PUJ.pdf and
// "Aircon Modern and Electric PUJ" / Modern PUJ.pdf).
//
//   Traditional PUJ          Regular                  Student/Elderly/PWD (−20%)
//     first 4 km             ₱14.00                   ₱11.20
//     each succeeding km     +₱2.00                   +₱1.60
//
//   Modern / Aircon / E-PUJ  Regular                  Student/Elderly/PWD (−20%)
//     first 4 km             ₱17.00                   ₱13.60
//     each succeeding km     +₱2.40                   +₱1.92
//
// NOTE from the guides: "Fares are rounded off to the nearest 25 centavos" and
// the 20% student/elderly/PWD discount applies every day per MC 2017-024.
//
// The AI must NEVER touch these numbers. This module is the single place fares
// are computed, so the demo math cannot be disputed by the judges.

export const FARE_TABLE = {
  traditional: {
    label: "Traditional PUJ",
    base: 14.0,
    perKm: 2.0,
    studentBase: 11.2,
    studentPerKm: 1.6,
  },
  modern: {
    label: "Modern / Aircon / E-PUJ",
    base: 17.0,
    perKm: 2.4,
    studentBase: 13.6,
    studentPerKm: 1.92,
  },
};

export const BASE_KM = 4; // first 4 km are the flat boarding fare
export const STUDENT_DISCOUNT = 0.2; // 20% per MC 2017-024
export const FARE_EFFECTIVE_DATE = "September 28, 2026";

/** Round a peso amount to the nearest 25 centavos, as the LTFRB guide requires. */
export function roundToQuarter(amount) {
  return Math.round(amount / 0.25) * 0.25;
}

/**
 * How many kilometers the passenger is actually charged for.
 * The fare table is a per-kilometer "add-on" ladder: the moment you enter the
 * 5th kilometer you pay for it, so distance is charged per *started* kilometer
 * (ceiling), never less than the 4 km boarding minimum.
 */
export function chargedKm(distanceKm) {
  const km = Math.ceil(Math.max(0, Number(distanceKm) || 0));
  return Math.max(BASE_KM, km);
}

/**
 * Compute the fare for one jeepney ride.
 * @param {"traditional"|"modern"} type
 * @param {number} distanceKm  real trip distance in km
 * @returns {{ type, chargedKm, regular, student, discountPct }}
 */
export function computeFare(type, distanceKm) {
  const t = FARE_TABLE[type];
  if (!t) throw new Error(`Unknown jeep type: ${type}`);

  const km = chargedKm(distanceKm);
  const extraKm = km - BASE_KM;

  const regular = roundToQuarter(t.base + extraKm * t.perKm);
  const student = roundToQuarter(t.studentBase + extraKm * t.studentPerKm);

  return {
    type,
    typeLabel: t.label,
    chargedKm: km,
    regular,
    student,
    discountPct: STUDENT_DISCOUNT * 100,
  };
}

/** Format a peso amount the way it is printed on a jeepney fare matrix. */
export function peso(amount) {
  return `₱${Number(amount).toFixed(2)}`;
}
