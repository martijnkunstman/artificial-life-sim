'use strict';

/* ---------- body genes ---------- */
// Every body gene is a multiplier on a baseline creature, except diet: 0 = plants only, 1 = meat only.
const GENE_RANGES = {
  size: [0.6, 1.8],
  speed: [0.6, 1.5],
  turn: [0.6, 1.5],
  sense: [0.6, 1.6],
  diet: [0, 1],
};
const GENE_LABELS = { size: 'Size', speed: 'Speed', turn: 'Agility', sense: 'Sight', diet: 'Diet' };

/* ---------- energy economy (tune with tools/headless.js --set BODY.key=value) ---------- */
const BODY = {
  // Defaults were chosen with the headless runner; see "Balance" in the README for the numbers.
  plantValue: 22,  // energy in one plant, at full plant digestion
  bodyValue: 65,   // energy in a prey body of size 1, at full meat digestion (scales with size^1.5)
  leftover: 0.2,   // share of the prey's remaining energy a hunter also gets
  meatUpkeep: 0.01, // extra drain per tick at diet 1 (a hunter's metabolism)
  digest: 100,     // ticks after a kill before a hunter can eat prey again
  dietCurve: 1.2,  // digestion efficiency = diet^curve; below 1 favours mixed diets, above 1 specialists
  biteReach: 1,    // contact distance multiplier for a kill
  hunterSpeed: 0.3, // extra top speed and acceleration at diet 1, as a fraction
  hunterProvision: 0.25, // extra share of max energy given to each newborn at diet 1 (parent pays it)
};

/* ---------- evolution and population rules ---------- */
const EVOLVE = {
  founders: [50, 22, 18], // starting creatures per diet group
  groupFloor: 3,     // a diet group below this is topped up from its own best genomes
  minPop: 30,        // below this the whole population is topped up from the best genomes
  cap: 520,
  bodyMutation: 0.5, // body genes mutate at this fraction of the brain's mutation rate
  bodyStep: 0.07,    // mutation step as a fraction of each gene's range
  minMeatEff: 0.15,  // below this meat efficiency a creature cannot hunt at all
  dietGap: 0.1,      // prey must be at least this much more plant-leaning than the hunter
  sizeRatio: 1.4,    // prey may be at most this much bigger than the hunter
};

/* ---------- diet groups (for display and founders only; the rules never look at them) ---------- */
const DIET_GROUPS = ['Plant-eaters', 'Mixed diet', 'Meat-eaters'];
const GROUP_COLOR_VARS = ['--herb', '--omni', '--carn'];
const FOUNDER_DIETS = [0.12, 0.5, 0.88];
const DIET_BUCKETS = 12;
const DIET_SPRITE_RADIUS = 6;

/* ---------- brain and world ---------- */
const INPUT_LABELS = [
  'plant ∠', 'plant ●',
  'threat ∠', 'threat ●', 'threat size',
  'prey ∠', 'prey ●', 'prey size',
  'wall ahead', 'wall left', 'wall right',
  'energy', 'digesting', 'speed',
];
const OUTPUT_LABELS = ['turn L', 'turn R', 'accel', 'brake'];
const BRAIN_SHAPE = [INPUT_LABELS.length, 12, OUTPUT_LABELS.length];
const PLANT_RADIUS = 2.6;
const PLANT_CAP = 900;

/* ---------- saved worlds ---------- */
const SAVE_FORMAT = 'neural-tidepool-world';
const SAVE_VERSION = 1;
