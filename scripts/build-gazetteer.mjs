// build-gazetteer.mjs — turn the raw GeoNames PH dump into a compact offline
// gazetteer bundled with the app, so BiyaheOffline can resolve ANY typed place
// (city, town, barangay, school, hospital, market, airport, station) to
// coordinates with no network — then estimate the fare from measured distance.
//
// One-time setup (downloads ~2.5 MB, CC BY 4.0 from GeoNames):
//   curl -sL -o .data/PH.zip https://download.geonames.org/export/dump/PH.zip
//   (unzip into .data/PH.txt)
//   node scripts/build-gazetteer.mjs
//
// Output: public/data/ph-places.json  (columnar to stay small)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, ".data", "PH.txt");
const OUT = join(root, "public", "data", "ph-places.json");

// GeoNames admin1 code → human region name (for disambiguating duplicate names).
const REGIONS = {
  NCR: "Metro Manila (NCR)",
  "15": "Cordillera (CAR)",
  "01": "Ilocos (Region I)",
  "02": "Cagayan Valley (Region II)",
  "03": "Central Luzon (Region III)",
  "40": "Calabarzon (Region IV-A)",
  "41": "Mimaropa (Region IV-B)",
  "05": "Bicol (Region V)",
  "06": "Western Visayas (Region VI)",
  "07": "Central Visayas (Region VII)",
  "08": "Eastern Visayas (Region VIII)",
  "09": "Zamboanga Peninsula (Region IX)",
  "10": "Northern Mindanao (Region X)",
  "11": "Davao (Region XI)",
  "12": "Soccsksargen (Region XII)",
  "13": "Caraga (Region XIII)",
  "14": "Bangsamoro (BARMM)",
  "00": "",
  "": "",
};

// Landmark feature codes worth keeping (prime commuter destinations).
const KEEP_S = new Set([
  "SCH", "SCHC", "SCHT", "UNIV", "HSP", "MKT", "MALL",
  "AIRP", "MTRO", "RSTN", "BUSTN", "BUSTP",
]);

const round4 = (n) => Math.round(parseFloat(n) * 1e4) / 1e4;

const places = [];
const seen = new Set();
for (const line of readFileSync(SRC, "utf8").split("\n")) {
  if (!line) continue;
  const c = line.split("\t");
  const fclass = c[6];
  const fcode = c[7];
  if (fclass !== "P" && !(fclass === "S" && KEEP_S.has(fcode))) continue;

  const name = c[1]?.trim();
  if (!name) continue;
  const lat = round4(c[4]);
  const lng = round4(c[5]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
  const admin1 = c[10] ?? "";
  const pop = parseInt(c[14], 10) || 0;

  const key = `${name.toLowerCase()}|${lat}|${lng}`;
  if (seen.has(key)) continue;
  seen.add(key);
  places.push([name, lat, lng, admin1, pop]);
}

// Most-populous first: makes ambiguous lookups prefer the major place.
places.sort((a, b) => b[4] - a[4]);

const usedRegions = {};
for (const p of places) usedRegions[p[3]] = REGIONS[p[3]] ?? "";

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify({
  attribution: "GeoNames (CC BY 4.0) — https://www.geonames.org/",
  count: places.length,
  fields: ["name", "lat", "lng", "admin1", "pop"],
  regions: usedRegions,
  places,
});
writeFileSync(OUT, json);
console.log(`wrote ${OUT}`);
console.log(`places: ${places.length}, bytes: ${json.length} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
