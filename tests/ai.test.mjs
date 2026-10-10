// Run: npm test (uses a fake WebLLM, no GPU needed)
import * as ai from "../src/ai/ai.js";
let pass = 0, total = 0;
const check = (name, cond) => { total++; if (cond) pass++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };

// Pretend this is a WebGPU browser.
Object.defineProperty(globalThis, "navigator", { value: { gpu: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) } }, configurable: true });
globalThis.performance ??= { now: () => Date.now() };

// parseModelJSON safety
check("valid JSON", ai.parseModelJSON('{"origin":"cubao","destination":"up_diliman"}').destination?.id === "up_diliman");
check("JSON wrapped in chatter", ai.parseModelJSON('Sure! {"origin":"Quiapo","destination":"U.P."}').origin?.id === "quiapo");
check("invented place rejected", ai.parseModelJSON('{"origin":"makati","destination":"bgc"}').origin === null);
check("garbage output", ai.parseModelJSON("I think you should ride a jeep").origin === null);

await ai.loadModel({ onProgress: () => {} });
check("model loads", ai.isReady() && ai.stats.model.includes("Qwen2.5-1.5B"));

// Rules handle a clear question: AI must not even be called.
let called = false;
globalThis.__reply = () => { called = true; return "{}"; };
let r = await ai.parseQuery("Galing ako Cubao, papuntang UP, magkano?");
check("clear question uses rules only", r.source === "rules" && !called && r.destination.id === "up_diliman");

// Messy question: rules find one place, AI fills the other.
globalThis.__reply = () => '{"origin":"sm_north","destination":"philcoa"}';
r = await ai.parseQuery("yung sa may mall na malaki sa north, tapos baba ko Philcoa");
check("AI fills missing origin", r.origin?.id === "sm_north" && r.destination?.id === "philcoa" && r.source === "rules+ai");

// AI hallucinates a place: app asks the user instead.
globalThis.__reply = () => '{"origin":"bgc","destination":"makati"}';
r = await ai.parseQuery("paano pumunta dun sa bandang Ayala?");
check("unknown places → picker", r.needsInput === "both" && r.suggestions.length > 0);

// Friendly reply safety
const route = { originName: "Cubao", destinationName: "UP Diliman", signboard: "UP Campus / Philcoa",
  jeepType: "traditional", transfers: [], distanceKm: 6, regularFare: 18, studentFare: 14.4 };
globalThis.__reply = () => "Sakay ka ng UP Campus / Philcoa jeep mula Cubao! Student fare mo ay ₱14.40. Ingat!";
check("good AI reply kept", (await ai.friendlyReply(route)).includes("Ingat!"));
globalThis.__reply = () => "Sakay ka ng jeep, ₱11.20 lang ang student fare mo!";
check("wrong fare → template used", (await ai.friendlyReply(route)) === ai.templateReply(route));
console.log("\nTemplate reply:", ai.templateReply(route));
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
