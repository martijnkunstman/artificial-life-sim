'use strict';

/* ---------- body genes ---------- */
// Size is a multiplier on a baseline body; diet runs from 0 = plants only to 1 = meat only.
const GENE_RANGES = {
  size: [0.6, 1.8],
  diet: [0, 1],
};

/* ---------- body parts ---------- */
// Each part has heritable parameters within these ranges. Angles are relative to the heading
// (0 = front, ±π = back) and wrap around when they mutate. max = how many of that part a body can carry.
const PART_SPECS = {
  eye: { max: 4, params: { angle: [-Math.PI, Math.PI], reach: [0.5, 1.6], width: [0.2, 1.6] } },
  fin: { max: 4, params: { angle: [-Math.PI, Math.PI], power: [0.3, 1.5] } },
  jaw: { max: 1, params: { power: [0.5, 1.5] } },
  spike: { max: 6, params: { length: [0.5, 1.5] } },
  armour: { max: 2, params: { thickness: [0.5, 1.5] } },
  fat: { max: 2, params: { amount: [0.5, 1.5] } },
};
const PART_TYPES = Object.keys(PART_SPECS);
const MAX_PARTS = 12;

// Starting bodies per diet group; founders get these with some jitter.
const FOUNDER_PARTS = [
  // Plant-eaters: two wide front eyes, a rear eye to watch for hunters, two rear fins.
  [{ type: 'eye', angle: -0.6, reach: 0.9, width: 1.1 }, { type: 'eye', angle: 0.6, reach: 0.9, width: 1.1 },
   { type: 'eye', angle: Math.PI, reach: 0.8, width: 0.9 },
   { type: 'fin', angle: -2.5, power: 1 }, { type: 'fin', angle: 2.5, power: 1 }],
  // Mixed diet: two front eyes, two fins, a small jaw.
  [{ type: 'eye', angle: -0.4, reach: 1, width: 1 }, { type: 'eye', angle: 0.4, reach: 1, width: 1 },
   { type: 'fin', angle: -2.5, power: 1 }, { type: 'fin', angle: 2.5, power: 1 },
   { type: 'jaw', power: 0.8 }],
  // Meat-eaters: one long narrow eye forward plus a wide one, strong fins, a full jaw.
  [{ type: 'eye', angle: 0, reach: 1.3, width: 0.6 }, { type: 'eye', angle: 0, reach: 0.8, width: 1.4 },
   { type: 'fin', angle: -2.6, power: 1.1 }, { type: 'fin', angle: 2.6, power: 1.1 },
   { type: 'jaw', power: 1 }],
];

/* ---------- energy economy (tune with tools/headless.js --set BODY.key=value) ---------- */
const BODY = {
  // Defaults were chosen with the headless runner; see "Balance" in the README for the numbers.
  plantValue: 22,  // energy in one plant, at full plant digestion
  bodyValue: 75,   // energy in a prey body of mass 1, at full meat digestion (scales with mass)
  leftover: 0.2,   // share of the prey's remaining energy a hunter also gets
  meatUpkeep: 0,   // extra drain per tick at diet 1 (a hunter's metabolism)
  digest: 100,     // ticks after a kill before a hunter can eat prey again
  dietCurve: 1.2,  // digestion efficiency = diet^curve; below 1 favours mixed diets, above 1 specialists
  biteReach: 1,    // contact distance multiplier for a kill
  spikeDefence: 0.15,  // chance per unit of spike length that a bite fails
  armourDefence: 0.25, // chance per unit of armour thickness that a bite fails
  maxDefence: 0.85,    // a bite always has at least this complement of a chance to land
  spikeDamage: 12,     // energy an attacker loses per unit of spike length when a bite fails
  recoil: 40,          // ticks an attacker must wait after a failed bite
  hunterSpeed: 0.3, // extra top speed and acceleration at diet 1, as a fraction
  hunterProvision: 0.25, // extra share of max energy given to each newborn at diet 1 (parent pays it)
};

/* ---------- evolution and population rules ---------- */
// Founders, minPop and cap are per 1000 x 1000 of world area (see AREA_UNIT) and scale with the world.
const EVOLVE = {
  founders: [50, 22, 18], // starting creatures per diet group
  groupFloor: 3,     // a diet group below this is topped up from its own best genomes
  minPop: 30,        // below this the whole population is topped up from the best genomes
  cap: 520,
  bodyMutation: 0.5, // body genes mutate at this fraction of the brain's mutation rate
  bodyStep: 0.07,    // mutation step as a fraction of each gene's or part parameter's range
  partAdd: 0.5,      // chance to gain a random part, as a fraction of the body mutation rate
  partRemove: 0.5,   // chance to lose a random part, as a fraction of the body mutation rate
  minMeatEff: 0.15,  // below this meat efficiency a creature cannot hunt at all
  dietGap: 0.1,      // prey must be at least this much more plant-leaning than the hunter
};

/* ---------- species (tune with tools/headless.js --set SPECIES.threshold=value) ---------- */
const SPECIES = {
  // A newborn whose body is further than this from its species' founding body founds a new species.
  threshold: 1.5,
  weights: {
    diet: 4,       // per unit of diet difference (0 to 1)
    size: 2,       // per full size range of difference
    partCount: 0.5, // per part more or fewer of one type
    partShape: 1,  // per matching part whose settings differ across their whole range
  },
  keepExtinct: 10800, // ticks an extinct species with no surviving branches stays in the tree (3 min)
  maxKept: 400,       // beyond this many species in the tree, the longest-extinct dead ends go first
  historyLength: 300, // species population samples kept for the chart (one every 30 ticks)
};

/* ---------- diet groups (for display and founders only; the rules never look at them) ---------- */
const DIET_GROUPS = ['Plant-eaters', 'Mixed diet', 'Meat-eaters'];
const GROUP_COLOR_VARS = ['--herb', '--omni', '--carn'];
const FOUNDER_DIETS = [0.12, 0.5, 0.88];
const DIET_BUCKETS = 12;
const DIET_SPRITE_RADIUS = 6;

/* ---------- brain and world ---------- */
// The world has no walls (it wraps around), so there are no wall sensors.
const INPUT_LABELS = [
  'plant ∠', 'plant ●',
  'threat ∠', 'threat ●', 'threat size',
  'prey ∠', 'prey ●', 'prey size',
  'energy', 'digesting', 'speed',
];
const OUTPUT_LABELS = ['turn L', 'turn R', 'accel', 'brake'];
const BRAIN_SHAPE = [INPUT_LABELS.length, 12, OUTPUT_LABELS.length];
// The world is a borderless square that wraps around at its edges, this many pixels wide and high.
const WORLD_SIZE = 2000;
// Densities were tuned on 1000 x 1000. Plant growth, the plant cap, fertile zones, founders and
// population limits are given per AREA_UNIT and scale with the world's area, so density stays the same.
const AREA_UNIT = 1000 * 1000;
const PLANT_RADIUS = 2.6;
const PLANT_CAP = 900;     // per AREA_UNIT
const ZONES = 3;           // fertile zones per AREA_UNIT
const ZONE_SPREAD = 180;   // how far plants spread around a fertile zone, in pixels

/* ---------- saved worlds ---------- */
const SAVE_FORMAT = 'neural-tidepool-world';
// The version is the date and time (UTC) of the release, shown in the panel. Set it anew with every
// change: saved worlds (kept in the browser or as files) only open in the version that saved them,
// so a new version always starts a fresh world.
const VERSION = '2026-10-23 23:20';
const AUTOSAVE_KEY = 'neural-tidepool:world';
const AUTOSAVE_PREF_KEY = 'neural-tidepool:keep-progress';
