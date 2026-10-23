'use strict';

/* ---------- species ---------- */
const HERB = 0, OMNI = 1, CARN = 2;
const SPECIES = [
  { name: 'Herbivore', colorVar: '--herb', radius: 5.5, maxSpeed: 2.1, accel: 0.14, maxTurn: 0.16,
    maxEnergy: 100, startEnergy: 60, reproEnergy: 82, reproCost: 46, childEnergy: 40,
    baseDrain: 0.04, moveDrain: 0.011, plantGain: 22, preyGain: 0, digest: 0, maxAge: 4200, initial: 50, minPop: 10, cap: 420, sense: 1 },
  { name: 'Omnivore', colorVar: '--omni', radius: 6.5, maxSpeed: 2.0, accel: 0.12, maxTurn: 0.14,
    maxEnergy: 130, startEnergy: 85, reproEnergy: 115, reproCost: 65, childEnergy: 55,
    baseDrain: 0.045, moveDrain: 0.012, plantGain: 14, preyGain: 32, digest: 160, maxAge: 5000, initial: 22, minPop: 6, cap: 200, sense: 1 },
  { name: 'Carnivore', colorVar: '--carn', radius: 7, maxSpeed: 2.35, accel: 0.15, maxTurn: 0.12,
    maxEnergy: 170, startEnergy: 125, reproEnergy: 160, reproCost: 95, childEnergy: 72,
    baseDrain: 0.07, moveDrain: 0.016, plantGain: 0, preyGain: 58, digest: 150, maxAge: 5600, initial: 10, minPop: 4, cap: 80, sense: 1 },
];
// Diet stays a fixed per-species diet value in classic mode, so both modes can share colours and grouping.
const CLASSIC_DIET = [0, 0.5, 1];

/* ---------- evolving bodies mode ---------- */
const MODE_CLASSIC = 'classic', MODE_EVOLVE = 'evolve';
// Every body gene is a multiplier on a baseline creature, except diet: 0 = plants only, 1 = meat only.
const GENE_RANGES = {
  size: [0.6, 1.8],
  speed: [0.6, 1.5],
  turn: [0.6, 1.5],
  sense: [0.6, 1.6],
  diet: [0, 1],
};
const GENE_LABELS = { size: 'Size', speed: 'Speed', turn: 'Agility', sense: 'Sight', diet: 'Diet' };
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
const DIET_GROUPS = ['Plant-eaters', 'Mixed diet', 'Meat-eaters'];
const FOUNDER_DIETS = [0.12, 0.5, 0.88];
const DIET_BUCKETS = 12;
const DIET_SPRITE_RADIUS = 6;
// Bitmasks over species ids: who hunts me, and whom I hunt.
const PREDATORS = [(1 << OMNI) | (1 << CARN), 1 << CARN, 0];
const PREY = [0, 1 << HERB, (1 << HERB) | (1 << OMNI)];

const INPUT_LABELS = ['plant ∠', 'plant ●', 'threat ∠', 'threat ●', 'prey ∠', 'prey ●', 'wall ahead', 'wall left', 'wall right', 'energy', 'speed'];
const OUTPUT_LABELS = ['turn L', 'turn R', 'accel', 'brake'];
const BRAIN_SHAPE = [INPUT_LABELS.length, 12, OUTPUT_LABELS.length];
const PLANT_RADIUS = 2.6;
const PLANT_CAP = 900;
const AGENT_CAP = 720;
