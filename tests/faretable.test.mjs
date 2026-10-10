// Run: node tests/faretable.test.mjs
// Proves the engine's fare math equals the OFFICIAL LTFRB "NEW FARE RATE" table
// (effective Sep 28 2026) for every kilometre 1..50, both jeep types, regular +
// student. The fixture was extracted directly from the two LTFRB PDFs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeFare } from "../src/engine/fares.js";

const here = dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(readFileSync(join(here, "fixtures", "ltfrb-new-fare-2026.json"), "utf8"));

let pass = 0,
  total = 0,
  mismatches = [];
const check = (name, cond, detail) => {
  total++;
  if (cond) pass++;
  else mismatches.push(`${name} ${detail || ""}`);
};

for (const type of ["traditional", "modern"]) {
  for (let km = 1; km <= 50; km++) {
    const want = table[type][km];
    const got = computeFare(type, km);
    check(`${type} km${km} regular`, got.regular === want.regular, `got ${got.regular} want ${want.regular}`);
    check(`${type} km${km} student`, got.student === want.student, `got ${got.student} want ${want.student}`);
  }
}

if (mismatches.length) {
  console.log("MISMATCHES:\n" + mismatches.slice(0, 20).join("\n"));
} else {
  console.log(`All ${total} official NEW-fare values match (traditional + modern, km 1..50, regular + student).`);
}
console.log(`\n${pass}/${total} passed  [source: LTFRB NEW FARE RATE, eff. ${table.effective}]`);
process.exit(pass === total ? 0 : 1);
