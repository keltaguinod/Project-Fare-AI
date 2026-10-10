// Run: node tests/engine.test.mjs
// Verifies Layer A (deterministic fares + routing) against the official LTFRB
// "NEW FARE RATE" tables effective September 28, 2026, plus the GPS-alarm math.
// (faretable.test.mjs additionally checks every km 1..50 against the full table.)
import { computeFare, roundToQuarter, chargedKm } from "../src/engine/fares.js";
import { plan, isRoutable } from "../src/engine/engine.js";
import { haversineMeters } from "../src/geo/alarm.js";
import { STOP_BY_ID } from "../src/ai/stops.js";

let pass = 0,
  total = 0;
const check = (name, cond) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- rounding --------------------------------------------------------------
check("round 11.20 → 11.25", roundToQuarter(11.2) === 11.25);
check("round 12.80 → 12.75", roundToQuarter(12.8) === 12.75);
check("round 13.60 → 13.50", roundToQuarter(13.6) === 13.5);
check("charged km floors at 4", chargedKm(2) === 4 && chargedKm(4.5) === 5 && chargedKm(6.5) === 7);

// ---- fares vs official table (regular / student) ---------------------------
// Traditional PUJ table rows (km → regular, student):
const trad = computeFare("traditional", 7); // row 7
check("trad 7km regular ₱20.00", trad.regular === 20.0);
check("trad 7km student ₱16.00", trad.student === 16.0);
const trad8 = computeFare("traditional", 8); // row 8
check("trad 8km regular ₱22.00", trad8.regular === 22.0);
check("trad 8km student ₱17.50", trad8.student === 17.5);
const trad4 = computeFare("traditional", 3); // boarding minimum
check("trad min regular ₱14.00", trad4.regular === 14.0);
check("trad min student ₱11.25", trad4.student === 11.25);

// Modern / Aircon / E-PUJ table rows:
const mod6 = computeFare("modern", 6); // row 6
check("modern 6km regular ₱21.75", mod6.regular === 21.75);
check("modern 6km student ₱17.50", mod6.student === 17.5);
const mod4 = computeFare("modern", 3.5); // boarding minimum (charged 4 km)
check("modern min regular ₱17.00", mod4.regular === 17.0);
check("modern min student ₱13.50", mod4.student === 13.5);

// ---- routing: direct lines -------------------------------------------------
const r1 = plan("cubao", "up_diliman");
check("cubao→up direct L1 traditional", r1.jeepType === "traditional" && r1.transfers.length === 0);
check("cubao→up 6.5 km", near(r1.distanceKm, 6.5));
check("cubao→up fare ₱20 / ₱16", r1.regularFare === 20.0 && r1.studentFare === 16.0);
check("cubao→up signboard", r1.signboard === "Cubao–Philcoa–UP");

const r2 = plan("quiapo", "philcoa");
check("quiapo→philcoa 8km ₱22 / ₱17.50", r2.regularFare === 22.0 && r2.studentFare === 17.5);

const r3 = plan("sm_north", "katipunan");
check("sm_north→katipunan modern ₱21.75 / ₱17.50", r3.jeepType === "modern" && r3.regularFare === 21.75 && r3.studentFare === 17.5);

const r4 = plan("cubao", "katipunan");
check("cubao→katipunan modern min ₱17 / ₱13.50", r4.regularFare === 17.0 && r4.studentFare === 13.5);

// ---- corridors unified from Nicole's original engine (values from her table) ----
const n1 = plan("fairview", "philcoa");
check("fairview→philcoa 14km ₱34 / ₱27.25", near(n1.distanceKm, 14) && n1.regularFare === 34 && n1.studentFare === 27.25);
check("fairview→philcoa signboard", n1.signboard === "Commonwealth / Philcoa");
const n2 = plan("cubao", "quiapo");
check("cubao→quiapo 9.5km ₱26 / ₱20.75", near(n2.distanceKm, 9.5) && n2.regularFare === 26 && n2.studentFare === 20.75);
const n3 = plan("taft_vitocruz", "baclaran");
check("taft→baclaran 5.6km ₱18 / ₱14.50", n3.regularFare === 18 && n3.studentFare === 14.5);
const n4 = plan("cubao", "ortigas");
check("cubao→ortigas 5.5km ₱18 / ₱14.50", n4.regularFare === 18 && n4.studentFare === 14.5);
const n5 = plan("pasig_palengke", "quiapo");
check("pasig→quiapo 11.2km ₱30 / ₱24", near(n5.distanceKm, 11.2) && n5.regularFare === 30 && n5.studentFare === 24);

// ---- routing: one transfer -------------------------------------------------
const rt = plan("quiapo", "up_diliman"); // L2 Quiapo→Philcoa, transfer, L1 Philcoa→UP
check("quiapo→up needs 1 transfer", rt.transfers.length === 1 && rt.legs.length === 2);
check("quiapo→up transfer is at Philcoa", rt.transfers[0].includes("Philcoa"));
check("quiapo→up total distance 10km", near(rt.distanceKm, 10.0));
// leg1: 8km trad = 22/17.50 ; leg2: 2km trad (charged 4km) = 14/11.25
check("quiapo→up summed fare ₱36 / ₱28.75", rt.regularFare === 36.0 && rt.studentFare === 28.75);

// ---- guards ----------------------------------------------------------------
check("same origin/dest throws", (() => { try { plan("cubao", "cubao"); return false; } catch { return true; } })());
check("isRoutable sane", isRoutable("cubao", "up_diliman") && !isRoutable("cubao", "cubao"));

// ---- GPS alarm math --------------------------------------------------------
check("haversine same point = 0", haversineMeters({ lat: 14.65, lng: 121.06 }, { lat: 14.65, lng: 121.06 }) === 0);
const d = haversineMeters(STOP_BY_ID.cubao.coords, STOP_BY_ID.up_diliman.coords);
check("haversine cubao↔up in 3–6 km range", d > 3000 && d < 6000);

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
