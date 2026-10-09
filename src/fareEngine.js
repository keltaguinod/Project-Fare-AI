// fareEngine.js - routes and jeepney fare computation (Layer A)

// Fare rules
export const FARE_RULES = {
  traditional: { baseFare: 14, baseKm: 4, perExtraKm: 2.0 },
  modern: { baseFare: 17, baseKm: 4, perExtraKm: 2.4 },
  studentDiscount: 0.2, // 20% student discount
};

// Route list (distances are approximate)
export const ROUTES = [
  {
    id: "fairview-philcoa",
    origin: "Fairview",
    destination: "Philcoa",
    originAliases: ["fairview", "fairview terminal", "sm fairview"],
    destinationAliases: ["philcoa", "up diliman", "up", "commonwealth philcoa"],
    distanceKm: 14,
    jeepneyType: "Commonwealth / Philcoa",
  },
  {
    id: "cubao-quiapo",
    origin: "Cubao",
    destination: "Quiapo",
    originAliases: ["cubao", "araneta", "araneta center", "gateway"],
    destinationAliases: ["quiapo", "quiapo church", "plaza miranda"],
    distanceKm: 9.5,
    jeepneyType: "Cubao - Quiapo",
  },
  {
    id: "morayta-quiapo",
    origin: "Morayta",
    destination: "Quiapo",
    originAliases: ["morayta", "feu", "feutech", "feu tech", "espana", "españa", "recto"],
    destinationAliases: ["quiapo", "quiapo church", "plaza miranda"],
    distanceKm: 1.5,
    jeepneyType: "Morayta - Quiapo",
  },
  {
    id: "taft-baclaran",
    origin: "Taft Avenue (Vito Cruz)",
    destination: "Baclaran",
    originAliases: ["taft", "vito cruz", "dlsu", "la salle", "taft avenue"],
    destinationAliases: ["baclaran", "redemptorist", "baclaran church"],
    distanceKm: 5.6,
    jeepneyType: "Taft - Baclaran",
  },
  {
    id: "cubao-ortigas",
    origin: "Cubao",
    destination: "Ortigas",
    originAliases: ["cubao", "araneta", "araneta center", "gateway"],
    destinationAliases: ["ortigas", "ortigas center", "megamall", "edsa shangri-la"],
    distanceKm: 5.5,
    jeepneyType: "Cubao - Ortigas",
  },
  {
    id: "pasig-quiapo",
    origin: "Pasig Palengke",
    destination: "Quiapo",
    originAliases: ["pasig palengke", "pasig market"], // no bare "pasig": Ortigas is also in Pasig
    destinationAliases: ["quiapo", "quiapo church", "plaza miranda"],
    distanceKm: 11.2,
    jeepneyType: "Pasig - Quiapo",
  },
];

// Cleans up text so spelling differences don't matter
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase() // lowercase
    .normalize("NFD") // split accents from letters
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // remove symbols
    .replace(/\s+/g, " ") // collapse extra spaces
    .trim();
}

// Rounds to the nearest 25 centavos (LTFRB fare guides round fares this way)
const roundQuarter = (n) => Math.round((n + 1e-9) * 4) / 4;

// Computes the fare for a given distance and jeepney type
export function computeFare(distanceKm, type) {
  const rule = FARE_RULES[type];

  // Input checks
  if (!rule) throw new Error(`Unknown jeepney type: ${type}`);
  if (typeof distanceKm !== "number" || !(distanceKm > 0)) {
    throw new Error("distanceKm must be a positive number");
  }

  // Km beyond the base distance (partial km counts as a full km)
  const extraKm = Math.max(0, Math.ceil(distanceKm - rule.baseKm));

  // Exact fare first, then round (the student fare is 80% of the exact fare, not of the rounded one)
  const exactRegular = rule.baseFare + extraKm * rule.perExtraKm;
  const regular = roundQuarter(exactRegular);
  const student = roundQuarter(exactRegular * (1 - FARE_RULES.studentDiscount));
  const discountAmount = regular - student;

  return { regular, student, discountAmount, extraKm };
}

// Checks if a typed name contains any alias from a list as a whole word/phrase
// ("Cubao Terminal" matches "cubao", but "cubaoo" does not)
function matches(aliases, name) {
  const n = ` ${normalize(name)} `;
  return aliases.some((a) => n.includes(` ${normalize(a)} `));
}

// Checks if a typed name is exactly one of the aliases
function matchesExact(aliases, name) {
  const n = normalize(name);
  return aliases.some((a) => normalize(a) === n);
}

// All routes that fit the origin and destination (either direction) using a given match test
function routesMatching(origin, destination, test) {
  return ROUTES.filter(
    (r) =>
      (test(r.originAliases, origin) && test(r.destinationAliases, destination)) || // same direction as listed
      (test(r.destinationAliases, origin) && test(r.originAliases, destination)) // reverse direction
  );
}

// Candidate routes: exact name matches win, otherwise fall back to loose matching
function findRoutes(origin, destination) {
  const exact = routesMatching(origin, destination, matchesExact);
  return exact.length > 0 ? exact : routesMatching(origin, destination, matches);
}

// Returns the route only when there is exactly one candidate
export function findRoute(origin, destination) {
  const found = findRoutes(origin, destination);
  return found.length === 1 ? found[0] : null;
}

// List of supported routes, used in "not found" replies
const supportedRoutes = () => ROUTES.map((r) => `${r.origin} ↔ ${r.destination}`);

// Main function: route lookup + fares for both jeepney types
export function getRouteFare(origin, destination) {
  const hasOrigin = normalize(origin) !== "";
  const hasDestination = normalize(destination) !== "";

  // Missing input (reason tells the caller what to ask the user)
  if (!hasOrigin || !hasDestination) {
    const reason = !hasOrigin && !hasDestination
      ? "missing_both"
      : !hasOrigin
        ? "missing_origin"
        : "missing_destination";
    return {
      found: false,
      reason,
      message: "Origin or destination is missing.",
      supportedRoutes: supportedRoutes(),
    };
  }

  const candidates = findRoutes(origin, destination);

  // Input fits more than one route (e.g. "Ortigas Quiapo" as a destination)
  if (candidates.length > 1) {
    return {
      found: false,
      reason: "ambiguous_route",
      message: "Input matches more than one route.",
      candidates: candidates.map((r) => `${r.origin} ↔ ${r.destination}`),
      supportedRoutes: supportedRoutes(),
    };
  }

  // Both given, but no matching route
  if (candidates.length === 0) {
    return {
      found: false,
      reason: "route_not_found",
      message: "Route not in offline database.",
      supportedRoutes: supportedRoutes(),
    };
  }

  const route = candidates[0];

  return {
    found: true,
    routeId: route.id,
    origin,
    destination,
    jeepneyType: route.jeepneyType,
    distanceKm: route.distanceKm,
    traditional: computeFare(route.distanceKm, "traditional"),
    modern: computeFare(route.distanceKm, "modern"),
  };
}