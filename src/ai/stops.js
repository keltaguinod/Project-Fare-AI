// stops.js — the list of places the app knows about.
// IMPORTANT (shared contract): every `id` here must match the stop ids used in
// the routing/fare engine (src/engine/routes.js). Aliases are what people
// actually type (nicknames, landmarks, common misspellings), lowercase.
//
// `coords` are approximate lat/lng for each landmark. They power the offline
// "Gising-Drop" GPS alarm (src/geo/alarm.js), which reads the phone's satellite
// position and never hits the network — so it works in airplane mode.

export const STOPS = [
  {
    id: "cubao",
    name: "Cubao",
    coords: { lat: 14.6219, lng: 121.0536 },
    aliases: ["cubao", "araneta", "araneta center", "gateway", "farmers", "farmers cubao", "kubaw"],
  },
  {
    id: "up_diliman",
    name: "UP Diliman",
    coords: { lat: 14.6539, lng: 121.0685 },
    aliases: ["up diliman", "up", "u.p.", "u.p", "diliman", "up campus", "up town", "uptown", "upd", "ateneo-up", "isko"],
  },
  {
    id: "philcoa",
    name: "Philcoa",
    coords: { lat: 14.6552, lng: 121.0588 },
    aliases: ["philcoa", "philcoa market", "philcoa terminal"],
  },
  {
    id: "quiapo",
    name: "Quiapo",
    coords: { lat: 14.5985, lng: 120.9830 },
    aliases: ["quiapo", "quiapo church", "kyapo", "plaza miranda"],
  },
  {
    id: "espana_ust",
    name: "España / UST",
    coords: { lat: 14.6097, lng: 120.9890 },
    aliases: ["ust", "u.s.t.", "espana", "españa", "espanya", "lacson", "dapitan", "morayta", "feu", "feu tech", "recto"],
  },
  {
    id: "sm_north",
    name: "SM North EDSA",
    coords: { lat: 14.6570, lng: 121.0300 },
    aliases: ["sm north", "sm north edsa", "north edsa", "trinoma", "sm north edsa terminal"],
  },
  {
    id: "katipunan",
    name: "Katipunan",
    coords: { lat: 14.6400, lng: 121.0730 },
    aliases: ["katipunan", "ateneo", "admu", "miriam", "kati"],
  },
  {
    id: "divisoria",
    name: "Divisoria",
    coords: { lat: 14.6030, lng: 120.9690 },
    aliases: ["divisoria", "divi", "168 mall", "tutuban"],
  },
  // --- corridors unified from Nicole's original fareEngine.js ---
  {
    id: "fairview",
    name: "Fairview",
    coords: { lat: 14.7360, lng: 121.0575 },
    aliases: ["fairview", "sm fairview", "fairview terminal"],
  },
  {
    id: "ortigas",
    name: "Ortigas",
    coords: { lat: 14.5850, lng: 121.0570 },
    aliases: ["ortigas", "ortigas center", "megamall", "sm megamall", "edsa shangri-la", "shangri-la"],
  },
  {
    id: "taft_vitocruz",
    name: "Taft (Vito Cruz)",
    coords: { lat: 14.5635, lng: 120.9940 },
    aliases: ["taft", "vito cruz", "dlsu", "la salle", "taft avenue"],
  },
  {
    id: "baclaran",
    name: "Baclaran",
    coords: { lat: 14.5330, lng: 120.9960 },
    aliases: ["baclaran", "redemptorist", "baclaran church"],
  },
  {
    id: "pasig_palengke",
    name: "Pasig Palengke",
    coords: { lat: 14.5760, lng: 121.0790 },
    // deliberately no bare "pasig": Ortigas is also in Pasig City
    aliases: ["pasig palengke", "pasig market"],
  },
];

export const STOP_BY_ID = Object.fromEntries(STOPS.map((s) => [s.id, s]));
