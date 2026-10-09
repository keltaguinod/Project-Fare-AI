// Run with: node fareEngine.test.mjs   (needs "type": "module" in package.json)
import assert from "node:assert/strict";
import { computeFare, getRouteFare, normalize } from "./fareEngine.js";

// Exactly 4 km = base fare only
assert.deepEqual(computeFare(4, "traditional"), { regular: 14, student: 11.25, discountAmount: 2.75, extraKm: 0 });

// Under 4 km = still base fare
assert.equal(computeFare(2.5, "traditional").regular, 14);
assert.equal(computeFare(2.5, "modern").regular, 17);

// 9.5 km -> 6 extra km (ceil of 5.5), same as the 10 km row of the official guide
assert.equal(computeFare(9.5, "traditional").regular, 26); // 14 + 6*2
assert.equal(computeFare(9.5, "traditional").student, 20.75);
assert.equal(computeFare(9.5, "modern").regular, 31.5); // 17 + 6*2.40 = 31.40, rounded to nearest 0.25
assert.equal(computeFare(9.5, "modern").student, 25);

// Spot checks against the LTFRB fare guides effective Sept 28, 2026: [km, regular, student]
const traditionalGuide = [[1, 14, 11.25], [5, 16, 12.75], [9, 24, 19.25], [25, 56, 44.75], [50, 106, 84.75]];
const modernGuide = [[1, 17, 13.5], [5, 19.5, 15.5], [9, 29, 23.25], [25, 67.5, 54], [50, 127.5, 102]];
for (const [km, regular, student] of traditionalGuide) {
  const f = computeFare(km, "traditional");
  assert.deepEqual([f.regular, f.student], [regular, student], `traditional ${km} km`);
}
for (const [km, regular, student] of modernGuide) {
  const f = computeFare(km, "modern");
  assert.deepEqual([f.regular, f.student], [regular, student], `modern ${km} km`);
}

// Lookup works both directions and with messy input
assert.equal(getRouteFare("Quiapo", "Cubao").found, true);
assert.equal(getRouteFare("  CUBÁO ", "ortigas").found, true);
assert.equal(getRouteFare("feu tech", "quiapo").routeId, "morayta-quiapo");
assert.equal(getRouteFare("Narnia", "Mordor").found, false);
assert.equal(normalize("  Españá!! "), "espana");

// Looser matching: extra words around the place name are fine
assert.equal(getRouteFare("Cubao Terminal", "Quiapo, Manila").found, true);
assert.equal(getRouteFare("Cubao, Quezon City", "Ortigas Center").routeId, "cubao-ortigas");
assert.equal(getRouteFare("SM Fairview", "UP Diliman").found, true);

// ...but partial words should not match
assert.equal(getRouteFare("Cubaoo", "Quiapo").found, false);
assert.equal(getRouteFare("", "").found, false);

// Missing input gets its own reason so the AI knows what to ask
assert.equal(getRouteFare("", "Quiapo").reason, "missing_origin");
assert.equal(getRouteFare(null, "Quiapo").reason, "missing_origin");
assert.equal(getRouteFare("Cubao", "").reason, "missing_destination");
assert.equal(getRouteFare(undefined, undefined).reason, "missing_both");

// Unknown place gets a different reason, plus the supported routes
const unknown = getRouteFare("Divisoria", "Quiapo");
assert.equal(unknown.reason, "route_not_found");
assert.equal(unknown.supportedRoutes.length, 6);

// Pasig Palengke <-> Quiapo (11.2 km -> 12 km row of the fare guide)
const pasig = getRouteFare("Pasig Palengke", "Quiapo");
assert.equal(pasig.routeId, "pasig-quiapo");
assert.deepEqual([pasig.traditional.regular, pasig.traditional.student], [30, 24]);
assert.deepEqual([pasig.modern.regular, pasig.modern.student], [36.25, 29]);
assert.equal(getRouteFare("Quiapo", "Pasig Palengke").routeId, "pasig-quiapo");
assert.equal(getRouteFare("Cubao", "Quiapo").routeId, "cubao-quiapo"); // still picks the right route

// Ortigas is in Pasig City, so "Pasig" alone must not select the Pasig Palengke route
assert.equal(getRouteFare("Ortigas, Pasig City", "Quiapo").found, false);
assert.equal(getRouteFare("Pasig", "Quiapo").found, false);

// Input that fits two routes is reported as ambiguous instead of guessing
const ambiguous = getRouteFare("Cubao", "Ortigas Quiapo");
assert.equal(ambiguous.reason, "ambiguous_route");
assert.equal(ambiguous.candidates.length, 2);

// All 6 routes against the official guide rows: [origin, destination, trad regular, trad student, modern regular, modern student]
const routeChecks = [
  ["Fairview", "Philcoa", 34, 27.25, 41, 32.75], // 14 km
  ["Cubao", "Quiapo", 26, 20.75, 31.5, 25], // 9.5 km -> 10 km row
  ["Morayta", "Quiapo", 14, 11.25, 17, 13.5], // 1.5 km -> base fare
  ["Taft", "Baclaran", 18, 14.5, 21.75, 17.5], // 5.6 km -> 6 km row
  ["Cubao", "Ortigas", 18, 14.5, 21.75, 17.5], // 5.5 km -> 6 km row
  ["Pasig Palengke", "Quiapo", 30, 24, 36.25, 29], // 11.2 km -> 12 km row
];
for (const [from, to, tr, ts, mr, ms] of routeChecks) {
  const r = getRouteFare(from, to);
  assert.deepEqual(
    [r.traditional.regular, r.traditional.student, r.modern.regular, r.modern.student],
    [tr, ts, mr, ms],
    `${from} -> ${to}`
  );
}

// Full check of 1-50 km against the printed LTFRB guides (effective Sept 28, 2026)
// Each row: [regular, student] for km 1, 2, 3, ... 50
const traditionalTable = [
  [14, 11.25], [14, 11.25], [14, 11.25], [14, 11.25], [16, 12.75], [18, 14.5], [20, 16], [22, 17.5], [24, 19.25], [26, 20.75],
  [28, 22.5], [30, 24], [32, 25.5], [34, 27.25], [36, 28.75], [38, 30.5], [40, 32], [42, 33.5], [44, 35.25], [46, 36.75],
  [48, 38.5], [50, 40], [52, 41.5], [54, 43.25], [56, 44.75], [58, 46.5], [60, 48], [62, 49.5], [64, 51.25], [66, 52.75],
  [68, 54.5], [70, 56], [72, 57.5], [74, 59.25], [76, 60.75], [78, 62.5], [80, 64], [82, 65.5], [84, 67.25], [86, 68.75],
  [88, 70.5], [90, 72], [92, 73.5], [94, 75.25], [96, 76.75], [98, 78.5], [100, 80], [102, 81.5], [104, 83.25], [106, 84.75],
];
const modernTable = [
  [17, 13.5], [17, 13.5], [17, 13.5], [17, 13.5], [19.5, 15.5], [21.75, 17.5], [24.25, 19.25], [26.5, 21.25], [29, 23.25], [31.5, 25],
  [33.75, 27], [36.25, 29], [38.5, 31], [41, 32.75], [43.5, 34.75], [45.75, 36.75], [48.25, 38.5], [50.5, 40.5], [53, 42.5], [55.5, 44.25],
  [57.75, 46.25], [60.25, 48.25], [62.5, 50], [65, 52], [67.5, 54], [69.75, 55.75], [72.25, 57.75], [74.5, 59.75], [77, 61.5], [79.5, 63.5],
  [81.75, 65.5], [84.25, 67.25], [86.5, 69.25], [89, 71.25], [91.5, 73], [93.75, 75], [96.25, 77], [98.5, 79], [101, 80.75], [103.5, 82.75],
  [105.75, 84.75], [108.25, 86.5], [110.5, 88.5], [113, 90.5], [115.5, 92.25], [117.75, 94.25], [120.25, 96.25], [122.5, 98], [125, 100], [127.5, 102],
];
for (let km = 1; km <= 50; km++) {
  const t = computeFare(km, "traditional");
  const m = computeFare(km, "modern");
  assert.deepEqual([t.regular, t.student], traditionalTable[km - 1], `traditional ${km} km`);
  assert.deepEqual([m.regular, m.student], modernTable[km - 1], `modern ${km} km`);
}

// Bad input should throw
assert.throws(() => computeFare(-1, "traditional"));
assert.throws(() => computeFare(5, "tricycle"));

console.log("All Layer A tests passed ✅");
console.log(getRouteFare("Cubao", "Quiapo"));
