#!/usr/bin/env node
'use strict';

/*
 * Headless balance runner: runs the real simulation classes in Node, without drawing,
 * over many seeds, and reports how each diet group fares and how many species arise.
 *
 *   node tools/headless.js                      10 seeds x 10 sim-minutes
 *   node tools/headless.js --seeds 20 --minutes 15
 *   node tools/headless.js --set plantRate=20 --set EVOLVE.dietGap=0.15
 *   node tools/headless.js --json > results.json
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The browser loads these as classic scripts in this order; Renderer, UIController and main stay out.
const SIM_FILES = [
  'Random.js', 'utils.js', 'config.js', 'Vector.js', 'NeuralNetwork.js', 'Genome.js',
  'Species.js', 'Plant.js', 'Agent.js', 'SpatialGrid.js', 'ParticleSystem.js', 'Simulation.js',
];
const GROUPS = ['plant', 'mixed', 'meat'];
const SAMPLE_EVERY = 300; // ticks (5 s of sim time)

function parseArgs(argv) {
  const opts = { seeds: 10, minutes: 10, seedStart: 1, width: 1280, height: 800, set: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--seeds') opts.seeds = Number(next());
    else if (a === '--minutes') opts.minutes = Number(next());
    else if (a === '--seed-start') opts.seedStart = Number(next());
    else if (a === '--size') [opts.width, opts.height] = next().split('x').map(Number);
    else if (a === '--set') opts.set.push(next());
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

function loadContext() {
  const context = vm.createContext({ console, performance });
  for (const f of SIM_FILES) {
    const file = path.join(__dirname, '..', 'js', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

// --set name=value: sim fields (plantRate, drainMult, mutationRate, sensorRange) or config paths such as EVOLVE.dietGap.
function applySettings(context, sim, sets) {
  for (const s of sets) {
    const [key, raw] = s.split('=');
    const value = JSON.parse(raw);
    if (key.includes('.')) vm.runInContext(`${key} = ${JSON.stringify(value)}`, context);
    else if (key in sim) sim[key] = value;
    else throw new Error(`Unknown setting ${key}`);
  }
}

function runSeed(context, opts, seed) {
  const sim = vm.runInContext(`new Simulation({ width: ${opts.width}, height: ${opts.height}, seed: ${seed} })`, context);
  applySettings(context, sim, opts.set);
  if (opts.set.length) sim.reset(seed); // settings that shape the founders must apply before the world is built
  sim.setSensorRange(sim.sensorRange);

  const totalTicks = Math.round(opts.minutes * 60 * 60);
  const half = Math.floor(totalTicks / 2);
  const samples = [];
  let birthsAtHalf = null, topUpsAtHalf = null;
  const t0 = performance.now();

  for (let t = 1; t <= totalTicks; t++) {
    sim.step();
    if (t === half) { birthsAtHalf = sim.births.slice(); topUpsAtHalf = sim.topUps.slice(); }
    if (t % SAMPLE_EVERY === 0) samples.push(sim.counts.slice());
  }
  const seconds = (performance.now() - t0) / 1000;

  const late = samples.slice(Math.floor(samples.length / 2));
  const groups = GROUPS.map((name, k) => {
    const lateCounts = late.map(c => c[k]);
    const mean = lateCounts.reduce((s, v) => s + v, 0) / Math.max(1, lateCounts.length);
    const lateBirths = sim.births[k] - birthsAtHalf[k];
    const lateTopUps = sim.topUps[k] - topUpsAtHalf[k];
    return {
      name,
      final: sim.counts[k],
      lateMean: mean,
      lateBirths,
      lateTopUps,
      // Thriving: in the second half it held well above its floor and births far outnumbered top-ups.
      thriving: mean >= vm.runInContext('EVOLVE.groupFloor', context) * 2 && lateBirths >= 3 * Math.max(1, lateTopUps),
    };
  });

  // Average body per diet group: size and number of each part type.
  const partTypes = vm.runInContext('PART_TYPES', context);
  const bodies = GROUPS.map(() => Object.fromEntries([['n', 0], ['size', 0], ...partTypes.map(t => [t, 0])]));
  for (const a of sim.agents) {
    const b = bodies[a.kind];
    b.n++;
    b.size += a.genome.genes.size;
    for (const p of a.genome.parts) b[p.type]++;
  }
  for (const b of bodies) for (const k in b) if (k !== 'n' && b.n) b[k] /= b.n;
  const body = { size: sim.agents.reduce((s, a) => s + a.genome.genes.size, 0) / Math.max(1, sim.agents.length) };

  // Species: how many are alive at the end, how many were ever founded, and how many living
  // species hold at least 5 members (the rest are mostly fresh offshoots and top-ups).
  const species = {
    alive: sim.species.alive,
    established: sim.species.list.filter(s => s.count >= 5).length,
    founded: sim.species.nextId - 1,
    largest: Math.max(0, ...sim.species.list.map(s => s.count)),
  };

  return { seed, groups, maxGen: sim.maxGen, population: sim.agents.length, body, bodies, species, tps: Math.round(totalTicks / seconds) };
}

function pad(v, n) { return String(v).padStart(n); }

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const context = loadContext();
  const results = [];
  for (let i = 0; i < opts.seeds; i++) {
    const r = runSeed(context, opts, opts.seedStart + i);
    results.push(r);
    if (!opts.json) {
      const cols = r.groups.map(g => `${g.name} ${pad(g.lateMean.toFixed(0), 3)} (${pad(g.lateBirths, 4)}b/${pad(g.lateTopUps, 3)}t)${g.thriving ? '*' : ' '}`);
      const sp = r.species;
      console.log(`seed ${pad(r.seed, 4)}  ${cols.join('  ')}  gen ${pad(r.maxGen, 3)}  size ${r.body.size.toFixed(2)}  species ${pad(sp.alive, 2)} (${sp.established} with 5+) of ${pad(sp.founded, 4)}  ${r.tps} t/s`);
    }
  }

  const summary = GROUPS.map((name, k) => {
    const gs = results.map(r => r.groups[k]);
    const means = gs.map(g => g.lateMean).sort((a, b) => a - b);
    return {
      name,
      thrivingShare: gs.filter(g => g.thriving).length / gs.length,
      medianLateMean: means[Math.floor(means.length / 2)],
      lateBirths: gs.reduce((s, g) => s + g.lateBirths, 0),
      lateTopUps: gs.reduce((s, g) => s + g.lateTopUps, 0),
    };
  });

  if (opts.json) {
    console.log(JSON.stringify({ options: opts, results, summary }, null, 2));
    return;
  }
  console.log(`\n${opts.seeds} seeds x ${opts.minutes} sim-minutes at ${opts.width}x${opts.height}${opts.set.length ? `  (${opts.set.join(', ')})` : ''}`);
  console.log('Second half of each run. b = births, t = top-ups, * = thriving (mean >= 2x floor and births >= 3x top-ups)');
  for (const s of summary) {
    console.log(`  ${s.name.padEnd(6)} thriving in ${pad(Math.round(s.thrivingShare * 100), 3)}% of seeds   median population ${pad(s.medianLateMean.toFixed(0), 3)}   births ${pad(s.lateBirths, 6)}   top-ups ${pad(s.lateTopUps, 4)}`);
  }
  const avgSp = k => (results.reduce((s, r) => s + r.species[k], 0) / results.length).toFixed(1);
  console.log(`  species: ${avgSp('alive')} alive at the end (${avgSp('established')} with 5+ members), ${avgSp('founded')} founded per run, largest ${avgSp('largest')} members`);
  // Average final body per group, over the seeds where that group had living members.
  const types = Object.keys(results[0].bodies[0]).filter(k => k !== 'n');
  console.log(`\nAverage body at the end (per creature)\n  group  ${types.map(t => t.padStart(7)).join('')}`);
  GROUPS.forEach((name, k) => {
    const alive = results.map(r => r.bodies[k]).filter(b => b.n);
    const avg = t => alive.length ? alive.reduce((s, b) => s + b[t], 0) / alive.length : NaN;
    console.log(`  ${name.padEnd(6)} ${types.map(t => pad(avg(t).toFixed(2), 7)).join('')}`);
  });
}

main();
