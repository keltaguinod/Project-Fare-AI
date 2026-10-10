// routes.js — the 5 core jeepney lines BiyaheOffline knows (Layer A data).
//
// Each line is an ordered list of stops with the cumulative distance (km) from
// the line's starting terminal. The distance between any two stops on a line is
// the absolute difference of their `km` marks, so we never hardcode N² pairs.
//
// Stop ids MUST match src/ai/stops.js exactly (the AI can only ever hand back
// an id that exists in that file). Distances are realistic Metro-Manila / QC
// estimates for the demo corridor — good enough for fare brackets, and the GPS
// alarm uses the real lat/lng coordinates in stops.js, not these numbers.

export const LINES = [
  {
    id: "L1",
    signboard: "Cubao–Philcoa–UP",
    type: "traditional",
    stops: [
      { id: "cubao", km: 0.0 },
      { id: "philcoa", km: 4.5 },
      { id: "up_diliman", km: 6.5 },
    ],
  },
  {
    id: "L2",
    signboard: "Quiapo–España–Philcoa",
    type: "traditional",
    stops: [
      { id: "quiapo", km: 0.0 },
      { id: "espana_ust", km: 2.5 },
      { id: "philcoa", km: 8.0 },
    ],
  },
  {
    id: "L3",
    signboard: "Divisoria–Quiapo–España",
    type: "traditional",
    stops: [
      { id: "divisoria", km: 0.0 },
      { id: "quiapo", km: 2.0 },
      { id: "espana_ust", km: 4.5 },
    ],
  },
  {
    id: "L4",
    signboard: "SM North–UP–Katipunan",
    type: "modern",
    stops: [
      { id: "sm_north", km: 0.0 },
      { id: "up_diliman", km: 3.5 },
      { id: "katipunan", km: 6.0 },
    ],
  },
  {
    id: "L5",
    signboard: "Cubao–Katipunan",
    type: "modern",
    stops: [
      { id: "cubao", km: 0.0 },
      { id: "katipunan", km: 3.0 },
    ],
  },
  // --- corridors unified from Nicole's original fareEngine.js (distances hers) ---
  {
    id: "N1",
    signboard: "Commonwealth / Philcoa",
    type: "traditional",
    stops: [
      { id: "fairview", km: 0.0 },
      { id: "philcoa", km: 14.0 },
    ],
  },
  {
    id: "N2",
    signboard: "Cubao–Quiapo",
    type: "traditional",
    stops: [
      { id: "cubao", km: 0.0 },
      { id: "quiapo", km: 9.5 },
    ],
  },
  {
    id: "N3",
    signboard: "Taft–Baclaran",
    type: "traditional",
    stops: [
      { id: "taft_vitocruz", km: 0.0 },
      { id: "baclaran", km: 5.6 },
    ],
  },
  {
    id: "N4",
    signboard: "Cubao–Ortigas",
    type: "traditional",
    stops: [
      { id: "cubao", km: 0.0 },
      { id: "ortigas", km: 5.5 },
    ],
  },
  {
    id: "N5",
    signboard: "Pasig–Quiapo",
    type: "traditional",
    stops: [
      { id: "pasig_palengke", km: 0.0 },
      { id: "quiapo", km: 11.2 },
    ],
  },
];

/** index: stop id -> [{ line, km }] for every line that serves that stop. */
export const STOP_INDEX = (() => {
  const idx = {};
  for (const line of LINES) {
    for (const s of line.stops) {
      (idx[s.id] ??= []).push({ line, km: s.km });
    }
  }
  return idx;
})();
