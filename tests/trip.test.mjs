// Run: node tests/trip.test.mjs
// Verifies the offline gazetteer + the "anywhere" trip orchestrator with a tiny
// injected dataset (no network, no real GeoNames file needed).
import { initGazetteer, resolvePlace } from "../src/geo/gazetteer.js";
import { extractOriginDest, resolveAny, estimateTrip, planFromQuery } from "../src/trip.js";

let pass = 0,
  total = 0;
const check = (name, cond) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

initGazetteer({
  regions: { NCR: "Metro Manila (NCR)", "40": "Calabarzon (Region IV-A)", "03": "Central Luzon (Region III)" },
  fields: ["name", "lat", "lng", "admin1", "pop"],
  places: [
    ["Quezon City", 14.676, 121.0437, "NCR", 3000000],
    ["Pasig", 14.5764, 121.0851, "NCR", 800000],
    ["Makati", 14.5547, 121.0244, "NCR", 600000],
    ["Marikina", 14.6507, 121.1029, "NCR", 450000],
    ["San Isidro", 15.35, 120.88, "03", 50000], // big
    ["San Isidro", 14.55, 121.02, "40", 0], // small
  ],
});

// ---- gazetteer resolution ----
check("exact match", resolvePlace("marikina").best?.name === "Marikina");
check("case/accent-insensitive", resolvePlace("MAKATI").best?.name === "Makati");
const si = resolvePlace("san isidro");
check("ambiguous name → most populous first", si.best?.pop === 50000 && si.best?.region.includes("Central Luzon"));
check("ambiguous name → both offered as candidates", si.candidates.length === 2);
check("too-short query → nothing", resolvePlace("m").best === null);

// ---- free-text extraction ----
const e1 = extractOriginDest("galing ako Marikina papuntang Pasig magkano");
check("extract galing/papuntang", e1.originText === "marikina" && e1.destText === "pasig");
const e2 = extractOriginDest("Marikina to Pasig");
check("extract X to Y", e2.originText === "marikina" && e2.destText === "pasig");
const e3 = extractOriginDest("magkano papuntang Makati");
check("extract dest-only", e3.destText === "makati" && e3.originText === null);
const e4 = extractOriginDest("from Makati to Pasig");
check("extract from/to", e4.originText === "makati" && e4.destText === "pasig");

// ---- resolveAny: known stop vs gazetteer ----
check("known stop resolves to stop", resolveAny("Cubao").resolved?.isStop === true);
check("non-stop resolves via gazetteer", resolveAny("Marikina").resolved?.isStop === false);

// ---- estimate math ----
const est = estimateTrip(resolveAny("Marikina").resolved, resolveAny("Pasig").resolved, "traditional");
check("estimate has positive distance", est.distanceKm > 0 && est.straightKm > 0);
check("estimate road factor applied", est.distanceKm > est.straightKm);
check("estimate fare ≥ boarding min, student < regular", est.regularFare >= 14 && est.studentFare < est.regularFare);

// ---- orchestrator ----
const r1 = await planFromQuery("Cubao to UP");
check("known stops → exact route", r1.kind === "route" && r1.signboard);
const r2 = await planFromQuery("galing Marikina papuntang Pasig", { type: "traditional" });
check("anywhere → estimate", r2.kind === "estimate" && r2.originName === "Marikina" && r2.destinationName === "Pasig");
const r3 = await planFromQuery("magkano papuntang Pasig");
check("missing origin → need origin", r3.kind === "need" && r3.needs === "origin");

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
