'use strict';

/* ---------- species ---------- */
const HERB = 0, OMNI = 1, CARN = 2;
const SPECIES = [
  { name: 'Herbivore', colorVar: '--herb', radius: 5.5, maxSpeed: 2.1, accel: 0.14, maxTurn: 0.16,
    maxEnergy: 100, startEnergy: 60, reproEnergy: 82, reproCost: 46, childEnergy: 40,
    baseDrain: 0.04, moveDrain: 0.011, plantGain: 22, preyGain: 0, digest: 0, maxAge: 4200, initial: 50, minPop: 10, cap: 420 },
  { name: 'Omnivore', colorVar: '--omni', radius: 6.5, maxSpeed: 2.0, accel: 0.12, maxTurn: 0.14,
    maxEnergy: 130, startEnergy: 85, reproEnergy: 115, reproCost: 65, childEnergy: 55,
    baseDrain: 0.045, moveDrain: 0.012, plantGain: 14, preyGain: 32, digest: 160, maxAge: 5000, initial: 22, minPop: 6, cap: 200 },
  { name: 'Carnivore', colorVar: '--carn', radius: 7, maxSpeed: 2.35, accel: 0.15, maxTurn: 0.12,
    maxEnergy: 170, startEnergy: 125, reproEnergy: 160, reproCost: 95, childEnergy: 72,
    baseDrain: 0.07, moveDrain: 0.016, plantGain: 0, preyGain: 58, digest: 150, maxAge: 5600, initial: 10, minPop: 4, cap: 80 },
];
// Bitmasks over species ids: who hunts me, and whom I hunt.
const PREDATORS = [(1 << OMNI) | (1 << CARN), 1 << CARN, 0];
const PREY = [0, 1 << HERB, (1 << HERB) | (1 << OMNI)];

const INPUT_LABELS = ['plant ∠', 'plant ●', 'threat ∠', 'threat ●', 'prey ∠', 'prey ●', 'wall ahead', 'wall left', 'wall right', 'energy', 'speed'];
const OUTPUT_LABELS = ['turn L', 'turn R', 'accel', 'brake'];
const BRAIN_SHAPE = [INPUT_LABELS.length, 12, OUTPUT_LABELS.length];
const PLANT_RADIUS = 2.6;
const PLANT_CAP = 900;
const AGENT_CAP = 720;
