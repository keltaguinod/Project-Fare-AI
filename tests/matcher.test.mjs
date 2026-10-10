// Run: node tests/matcher.test.mjs
import { quickParse, resolveStop } from "../src/ai/matcher.js";

const cases = [
  ["I am in Cubao going to UP Diliman. What jeep do I ride and how much is the student fare?", "cubao", "up_diliman"],
  ["Galing ako Cubao, papuntang UP, magkano?", "cubao", "up_diliman"],
  ["galing ako ng cubao papuntang u.p. diliman", "cubao", "up_diliman"],
  ["Cubao to UP", "cubao", "up_diliman"],
  ["Cubao UP magkano", "cubao", "up_diliman"],
  ["pauwi na ko sa Philcoa from Quiapo, anong jeep?", "quiapo", "philcoa"],
  ["nasa Trinoma ako, gusto ko pumunta Katipunan", "sm_north", "katipunan"],
  ["andito ako sa Katipunan, papuntang Quiapo", "katipunan", "quiapo"],
  ["papunta akong UST galing Divisoria", "divisoria", "espana_ust"],
  ["Ibaba mo ako sa Philcoa, sakay ako sa SM North EDSA", "sm_north", "philcoa"],
  ["from araneta to ateneo", "cubao", "katipunan"],
  ["uuwi na ako sa Cubao from España", "espana_ust", "cubao"],
  ["paano pumunta ng UST?", null, "espana_ust"],
  ["magkano pamasahe papuntang Makati?", null, null],
  ["pick up ko kapatid ko sa Quiapo", null, null, "any"], // ambiguous: only check no crash
];

let pass = 0;
for (const [q, o, d, mode] of cases) {
  const r = quickParse(q);
  const got = [r.origin?.id ?? null, r.destination?.id ?? null];
  const ok = mode === "any" || (got[0] === o && got[1] === d);
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${q}\n      → origin=${got[0]} destination=${got[1]} confident=${r.confident}`);
}
console.log(`\n${pass}/${cases.length} passed`);

console.log("\nresolveStop checks:",
  resolveStop("U.P.")?.id, resolveStop("Araneta Center")?.id, resolveStop("up_diliman")?.id,
  resolveStop("Makati"), resolveStop(null), resolveStop("null"));
process.exit(pass === cases.length ? 0 : 1);
