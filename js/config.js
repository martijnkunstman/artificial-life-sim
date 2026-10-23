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
  sizeRatio: 1.15,   // prey may be at most this much bigger than the hunter
};

/* ---------- diet groups (for display and founders only; the rules never look at them) ---------- */
const DIET_GROUPS = ['Plant-eaters', 'Mixed diet', 'Meat-eaters'];
const GROUP_COLOR_VARS = ['--herb', '--omni', '--carn'];
const FOUNDER_DIETS = [0.12, 0.5, 0.88];
const DIET_BUCKETS = 12;
const DIET_SPRITE_RADIUS = 6;

/* ---------- brain and world ---------- */
const INPUT_LABELS = ['plant ∠', 'plant ●', 'threat ∠', 'threat ●', 'prey ∠', 'prey ●', 'wall ahead', 'wall left', 'wall right', 'energy', 'speed'];
const OUTPUT_LABELS = ['turn L', 'turn R', 'accel', 'brake'];
const BRAIN_SHAPE = [INPUT_LABELS.length, 12, OUTPUT_LABELS.length];
const PLANT_RADIUS = 2.6;
const PLANT_CAP = 900;
