// main.js — BiyaheOffline app shell (Developer 3): wires the local AI pipeline
// (Layer B), the deterministic route/fare engine (Layer A), and the offline GPS
// alarm into one mobile PWA. The UI never does math — it only asks the engine.

import "./style.css";
import * as ai from "./ai/ai.js";
import { STOPS, STOP_BY_ID } from "./ai/stops.js";
import { startArrivalAlarm, canVibrate, locate } from "./geo/alarm.js";
import { planFromQuery, planResolved, estimateTrip, resolveAny } from "./trip.js";

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

// ---------------------------------------------------------------------------
// shared state
// ---------------------------------------------------------------------------
let pendingTrip = { origin: null, destination: null, originCandidates: [], destCandidates: [] };
let currentType = "traditional"; // default jeep type for distance estimates
let activeAlarm = null; // only one GPS alarm runs at a time
let gpsOrigin = null; // resolved {name,lat,lng} when the user taps 📍 "use my location"

// ---------------------------------------------------------------------------
// chat helpers
// ---------------------------------------------------------------------------
const chat = $("chat");
function scrollChat() {
  chat.scrollTop = chat.scrollHeight;
}
function addMsg(role, text) {
  const el = h("div", `msg ${role}`, text);
  chat.appendChild(el);
  scrollChat();
  return el;
}

// ---------------------------------------------------------------------------
// status chips + offline-proof panel
// ---------------------------------------------------------------------------
function setChip(el, text, cls) {
  el.textContent = text;
  el.className = "chip" + (cls ? " " + cls : "");
}
function updateNet() {
  const online = navigator.onLine;
  setChip($("chip-net"), online ? "● Online" : "✈ Offline-ready", online ? "" : "ok");
  $("pf-net").textContent = online ? "Online" : "Offline (airplane mode) — app still works";
}
function shortModel(id) {
  return id ? id.split("-").slice(0, 2).join(" ") : "—";
}
function refreshProof() {
  $("pf-model").textContent = ai.stats.model ? shortModel(ai.stats.model) : "not loaded";
  $("pf-load").textContent = ai.stats.loadMs ? (ai.stats.loadMs / 1000).toFixed(1) + " s" : "—";
  if (ai.stats.lastParseMs != null) {
    $("pf-parse").textContent = `${ai.stats.lastParseMs} ms via ${ai.stats.lastParseSource}`;
  }
}
/** Update the AI status line inside the hidden ✨ menu + highlight the toggle. */
function setAiStatus(text, ready = false) {
  const el = $("ai-status");
  if (el) el.textContent = text;
  $("ai-toggle")?.classList.toggle("active", ready);
}

// ---------------------------------------------------------------------------
// place picker (shown when a typed place can't be resolved)
// ---------------------------------------------------------------------------
function hidePicker() {
  $("picker").hidden = true;
  $("picker-buttons").innerHTML = "";
}
const shortRegion = (r) => (r ? r.replace(/\s*\(.*\)\s*/, "").trim() : "");

/** A resolved-place object for a known demo stop (for the fallback list). */
function stopResolved(stop) {
  return (
    resolveAny(stop.name).resolved || {
      id: stop.id,
      name: stop.name,
      lat: stop.coords.lat,
      lng: stop.coords.lng,
      region: "Metro Manila (NCR)",
      isStop: true,
    }
  );
}

function askForMissing() {
  const side = !pendingTrip.origin ? "origin" : !pendingTrip.destination ? "destination" : null;
  if (!side) return finalizeTrip();

  $("picker-q").textContent =
    (side === "origin" ? "Saan ka galing?" : "Saan ka papunta?") + " — pumili, o i-type nang mas malinaw sa baba.";
  const box = $("picker-buttons");
  box.innerHTML = "";

  // For the origin, offer "use my GPS location" first ("I just boarded").
  if (side === "origin") {
    const gps = h("button", "gps-opt", "📍 Lokasyon ko ngayon (GPS)");
    gps.onclick = () => useGpsAsOrigin(true);
    box.appendChild(gps);
  }

  const cands = side === "origin" ? pendingTrip.originCandidates : pendingTrip.destCandidates;
  const list = (cands && cands.length ? cands : STOPS.map(stopResolved)).slice(0, 8);
  for (const c of list) {
    const place = c.isStop === undefined ? { ...c, isStop: false } : c;
    const label = place.region ? `${place.name} · ${shortRegion(place.region)}` : place.name;
    const b = h("button", null, label);
    b.onclick = () => onPick(side, place);
    box.appendChild(b);
  }
  $("picker").hidden = false;
}

function onPick(side, place) {
  pendingTrip[side] = place;
  hidePicker();
  addMsg("user", `${side === "origin" ? "Galing" : "Papunta"}: ${place.name}`);
  askForMissing();
}

// ---------------------------------------------------------------------------
// GPS origin ("I just boarded — use my current location")
// ---------------------------------------------------------------------------
function showOriginChip() {
  if (!gpsOrigin) {
    $("origin-chip").hidden = true;
    $("gps")?.classList.remove("on");
    return;
  }
  $("origin-chip-name").textContent = gpsOrigin.name;
  $("origin-chip").hidden = false;
  $("gps")?.classList.add("on");
}
function clearGpsOrigin() {
  gpsOrigin = null;
  showOriginChip();
}
async function useGpsAsOrigin(continuePending = false) {
  const btn = $("gps");
  if (btn) btn.disabled = true;
  try {
    const pos = await locate();
    gpsOrigin = { name: "Lokasyon ko", lat: pos.lat, lng: pos.lng, region: "", isStop: false };
    showOriginChip();
    if (continuePending) {
      pendingTrip.origin = gpsOrigin;
      hidePicker();
      addMsg("user", "Galing: 📍 Lokasyon ko ngayon");
      askForMissing();
    }
  } catch (e) {
    addMsg("bot", "Hindi ma-access ang GPS: " + (e.message || "payagan ang location sa browser."));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// main ask flow — anywhere: known jeepney routes OR distance-based estimates
// ---------------------------------------------------------------------------
async function ask(text) {
  text = text.trim();
  if (!text) return;
  hidePicker();
  addMsg("user", text);
  $("q").value = "";
  const thinking = addMsg("bot thinking", ai.isReady() ? "Iniintindi ko…" : "Hinahanap ang lugar…");

  let result;
  try {
    result = await planFromQuery(text, {
      type: currentType,
      origin: gpsOrigin, // used only if no origin is typed in the query
      aiExtract: ai.isReady() ? ai.extractTripText : undefined,
    });
  } catch (e) {
    thinking.remove();
    addMsg("bot", "Ay, hindi pa ma-load ang listahan ng lugar. Kapag naka-Wi-Fi ka, mag-o-offline na ’to pagkatapos.");
    return;
  }
  refreshProof();

  if (result.kind === "need") {
    thinking.remove();
    pendingTrip = {
      origin: result.origin || null,
      destination: result.destination || null,
      originCandidates: result.originCandidates || [],
      destCandidates: result.destCandidates || [],
    };
    addMsg(
      "bot",
      result.needs === "both"
        ? "Hindi ko makita ang mga lugar. Pakipili o i-type nang mas malinaw:"
        : result.needs === "origin"
          ? "Saan ka ba galing?"
          : "Saan ka ba papunta?"
    );
    askForMissing();
    return;
  }

  await showResult(result, thinking);
}

function finalizeTrip() {
  const { origin, destination } = pendingTrip;
  pendingTrip = { origin: null, destination: null, originCandidates: [], destCandidates: [] };
  showResult(planResolved(origin, destination, currentType), null);
}

async function showResult(result, thinkingEl) {
  if (result.kind === "estimate") {
    thinkingEl?.remove();
    chat.appendChild(buildEstimateCard(result));
    scrollChat();
    return;
  }
  // exact known route → AI (or template) phrasing
  const th = thinkingEl || addMsg("bot thinking", "Binubuo ko ang sagot…");
  th.className = "msg bot thinking";
  th.textContent = "Binubuo ko ang sagot…";
  let reply;
  try {
    reply = await ai.friendlyReply(result);
  } catch {
    reply = ai.templateReply(result);
  }
  th.remove();
  refreshProof();
  renderRoute(result, reply);
}

// ---------------------------------------------------------------------------
// route result card
// ---------------------------------------------------------------------------
function fmtPeso(n) {
  return "₱" + Number(n).toFixed(2);
}
function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
}

function renderRoute(route, replyText) {
  const card = h("div", "route");

  card.appendChild(h("div", "reply", replyText));

  const od = h("div", "od");
  od.appendChild(h("span", null, route.originName));
  od.appendChild(h("span", "arrow", "→"));
  od.appendChild(h("span", null, route.destinationName));
  od.appendChild(h("span", `badge ${route.jeepType}`, route.jeepType));
  card.appendChild(od);

  card.appendChild(h("div", "signboard", `Signboard: "${route.signboard}"`));

  const meta = h("div", "meta");
  meta.appendChild(h("span", null, `📏 ~${route.distanceKm} km`));
  meta.appendChild(h("span", null, `🪑 ${route.legs.length} sakay`));
  card.appendChild(meta);

  if (route.legs.length > 1) {
    const legs = h("div", "legs");
    route.legs.forEach((leg, i) => {
      const row = h("div", "leg");
      row.innerHTML = `<b>${i + 1}.</b> "${leg.signboard}" · ${leg.fromName} → ${leg.toName} · ${leg.distanceKm} km · ${fmtPeso(leg.studentFare)} student`;
      legs.appendChild(row);
    });
    card.appendChild(legs);
  }

  const fares = h("div", "fares");
  const student = h("div", "fare student");
  student.appendChild(h("div", "k", "Student / PWD / Senior"));
  student.appendChild(h("div", "v", fmtPeso(route.studentFare)));
  student.appendChild(h("div", "d", "−20% legal discount"));
  const regular = h("div", "fare");
  regular.appendChild(h("div", "k", "Regular"));
  regular.appendChild(h("div", "v", fmtPeso(route.regularFare)));
  regular.appendChild(h("div", "d", "LTFRB new rate"));
  fares.appendChild(student);
  fares.appendChild(regular);
  card.appendChild(fares);

  addAlarmRow(card, STOP_BY_ID[route.destinationId]?.coords, route.destinationName);

  chat.appendChild(card);
  scrollChat();
}

// ---------------------------------------------------------------------------
// estimate result card (anywhere, distance-based)
// ---------------------------------------------------------------------------
function buildEstimateCard(est) {
  const card = h("div", "route");

  const reply =
    `Mula ${est.originName}${est.originRegion ? ` (${shortRegion(est.originRegion)})` : ""} papuntang ` +
    `${est.destinationName}${est.destRegion ? ` (${shortRegion(est.destRegion)})` : ""}: tinatayang ${est.distanceKm} km. ` +
    `Tinatayang pamasahe lang ito base sa distansya — walang fixed na ruta/signboard sa labas ng demo lines.`;
  card.appendChild(h("div", "reply", reply));

  const od = h("div", "od");
  od.appendChild(h("span", null, est.originName));
  od.appendChild(h("span", "arrow", "→"));
  od.appendChild(h("span", null, est.destinationName));
  od.appendChild(h("span", `badge ${est.jeepType}`, est.jeepType));
  card.appendChild(od);

  card.appendChild(h("div", "estnote", "⚠️ Tinatayang pamasahe (estimate)"));

  const meta = h("div", "meta");
  meta.appendChild(h("span", null, `📏 ~${est.distanceKm} km (tuwid ${est.straightKm} × ${est.roadFactor})`));
  meta.appendChild(h("span", null, `🧾 sinisingil: ${est.chargedKm} km`));
  card.appendChild(meta);

  // jeep type toggle — recompute the estimate in place
  const toggle = h("div", "typetoggle");
  for (const t of ["traditional", "modern"]) {
    const b = h("button", t === est.jeepType ? "on" : null, t === "modern" ? "Modern / Aircon" : "Traditional");
    b.onclick = () => {
      if (t === est.jeepType) return;
      currentType = t;
      card.replaceWith(buildEstimateCard(estimateTrip(est.origin, est.destination, t)));
    };
    toggle.appendChild(b);
  }
  card.appendChild(toggle);

  const fares = h("div", "fares");
  const student = h("div", "fare student");
  student.appendChild(h("div", "k", "Student / PWD / Senior"));
  student.appendChild(h("div", "v", fmtPeso(est.studentFare)));
  student.appendChild(h("div", "d", "−20% · estimate"));
  const regular = h("div", "fare");
  regular.appendChild(h("div", "k", "Regular"));
  regular.appendChild(h("div", "v", fmtPeso(est.regularFare)));
  regular.appendChild(h("div", "d", "LTFRB rate · estimate"));
  fares.appendChild(student);
  fares.appendChild(regular);
  card.appendChild(fares);

  addAlarmRow(card, est.destCoords, est.destinationName);
  return card;
}

// ---------------------------------------------------------------------------
// shared GPS "Gising-Drop" alarm row (used by route + estimate cards)
// ---------------------------------------------------------------------------
function addAlarmRow(card, destCoords, destName) {
  if (!destCoords) return;
  const alarmRow = h("div", "alarm-row");
  const btn = h("button", "btn-alarm", "🔔 Gising-Drop Alarm (300 m)");
  const status = h("p", "alarm-status");
  alarmRow.appendChild(btn);
  alarmRow.appendChild(status);
  card.appendChild(alarmRow);
  btn.onclick = () => toggleAlarm(destCoords, destName, btn, status);
}

function toggleAlarm(destCoords, destName, btn, status) {
  if (btn.classList.contains("on")) {
    activeAlarm?.stop();
    activeAlarm = null;
    btn.classList.remove("on");
    btn.textContent = "🔔 Gising-Drop Alarm (300 m)";
    status.textContent = "";
    status.classList.remove("fired");
    return;
  }
  activeAlarm?.stop(); // only one alarm at a time
  status.classList.remove("fired");
  status.textContent = "Hinihintay ang GPS… (payagan ang location)";
  activeAlarm = startArrivalAlarm(destCoords, {
    radiusMeters: 300,
    onUpdate: ({ distanceMeters, accuracy }) => {
      if (!status.classList.contains("fired"))
        status.textContent = `GPS: ${fmtDist(distanceMeters)} papuntang ${destName} (±${Math.round(accuracy)} m)`;
    },
    onTrigger: () => {
      status.classList.add("fired");
      status.textContent = `🔔 Malapit na! ~300 m na lang papuntang ${destName}. Ihanda na ang bayad!`;
      if (!canVibrate()) status.textContent += " (walang vibration sa device na ’to)";
    },
    onError: (e) => {
      status.textContent = "GPS: " + (e.message || "hindi ma-access ang lokasyon.");
    },
  });
  btn.classList.add("on");
  btn.textContent = "🔔 Alarm ON — i-tap para itigil";
}

// ---------------------------------------------------------------------------
// AI model loading
// ---------------------------------------------------------------------------
async function onLoadModel() {
  const btn = $("load");
  btn.disabled = true;
  setAiStatus("loading…");
  try {
    await ai.loadModel({
      modelId: $("model").value,
      onProgress: ({ progress, text }) => {
        $("bar").style.width = Math.round((progress || 0) * 100) + "%";
        $("load-hint").textContent = text || "Dina-download…";
      },
    });
    setAiStatus("on · " + shortModel(ai.stats.model), true);
    $("ai-menu").classList.add("ready");
    $("load-hint").textContent = `✅ ${shortModel(ai.stats.model)} loaded in ${(ai.stats.loadMs / 1000).toFixed(1)} s. Naka-save na — gagana offline.`;
    addMsg("bot", "Loaded na ang AI! Mas maiintindihan ko na ang magulong Taglish. 🚍");
    refreshProof();
    $("pf-cache").textContent = "yes";
  } catch (e) {
    btn.disabled = false;
    setAiStatus("failed");
    $("load-hint").textContent = "❌ " + e.message + " — pero gumagana pa rin ang search (rules + fare math).";
  }
}

// ---------------------------------------------------------------------------
// local-AI menu (hidden, opened by the ✨ composer button)
// ---------------------------------------------------------------------------
function setupAiMenu() {
  const toggle = $("ai-toggle");
  const menu = $("ai-menu");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
async function init() {
  // Dev self-heal: a service worker registered by an earlier `vite dev` session
  // can keep serving a stale app shell. Unregister it + clear caches so dev
  // always runs fresh. Stripped from the production build (import.meta.env.DEV).
  if (import.meta.env.DEV && "serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    } catch {}
  }

  updateNet();
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);

  // Wire widgets defensively — a single missing element must never stop the AI
  // setup (the WebGPU probe) below from running.
  $("composer")?.addEventListener("submit", (e) => {
    e.preventDefault();
    ask($("q").value);
  });
  $("load")?.addEventListener("click", onLoadModel);
  $("model")?.addEventListener("change", async () => {
    $("pf-cache").textContent = (await ai.isModelCached($("model").value)) ? "yes" : "no";
  });
  setupAiMenu();

  // 📍 GPS-as-origin toggle + the "from my location" chip
  $("gps")?.addEventListener("click", () => (gpsOrigin ? clearGpsOrigin() : useGpsAsOrigin(false)));
  $("origin-chip-clear")?.addEventListener("click", clearGpsOrigin);

  // welcome + examples
  addMsg(
    "bot",
    "Kumusta! Ako si BiyaheOffline. I-type kung saan ka papunta (o 'from X to Y'), o i-tap ang 📍 para gamitin ang lokasyon mo bilang pinanggalingan. Sasabihin ko ang pamasahe — kahit anong lugar sa Pilipinas, offline."
  );
  const ex = h("div", "msg bot");
  ex.appendChild(h("div", null, "Subukan:"));
  const chips = h("div", "examples");
  [
    "SM Mall of Asia",
    "Marikina papuntang Pasig",
    "Cubao papuntang UP",
    "Baguio to La Trinidad",
  ].forEach((q) => {
    const b = h("button", null, q);
    b.onclick = () => ask(q);
    chips.appendChild(b);
  });
  ex.appendChild(chips);
  chat.appendChild(ex);

  // capability probe for the (optional) local AI
  const gpu = await ai.checkWebGPU();
  if (gpu.ok) {
    $("pf-gpu").textContent = `available (shader-f16: ${gpu.shaderF16})`;
    setAiStatus("ready to load");
    $("load-hint").textContent = "Opsyonal. I-load kapag naka-Wi-Fi — pagkatapos, offline na.";
  } else {
    $("pf-gpu").textContent = gpu.reason;
    setAiStatus("n/a — rules only");
    if ($("load")) $("load").disabled = true;
    $("load-hint").textContent =
      "Walang WebGPU sa browser na ito (gumamit ng Chrome/Edge 121+). OK lang — gumagana pa rin ang search, routing at fare math.";
  }
  $("pf-cache").textContent = (await ai.isModelCached($("model").value)) ? "yes" : "no";
  refreshProof();
}

init();
