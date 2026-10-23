'use strict';

/* ---------- Progress: is evolution actually producing better creatures? ---------- */
// Numbers from the living world (population, lifespan, offspring) settle into an equilibrium even while
// creatures improve, because their competitors and prey improve too. So every PROGRESS.every ticks a
// few living creatures sit standardized exams in a private test arena, always with the same layout:
//   - foraging: alone with plants, how many plants per minute does it eat?
//   - hunting: with a few standard, untrained prey, how many does it catch per minute?
// The same exams are given once to untrained founders (random brains), as the baseline to beat.
// Exams use copies of the creatures and their own generator position (swapped in and out around each
// slice of work), so testing never changes how the world plays out. A round of exams is spread over
// many ticks, PROGRESS.slice exam ticks per world tick, so it never stalls a frame.
const PROGRESS = {
  every: 2400,       // ticks between rounds of exams (40 s of sim time); doubles each time the record is thinned
  slice: 30,         // exam ticks run per world tick while a round is under way
  maxSamples: 360,   // beyond this, neighbouring samples are merged in pairs
  examinees: 3,      // living creatures examined per group and exam
  baselineN: 8,      // untrained founders examined per group for the baseline
  forageTicks: 900,  // length of one foraging exam (15 s)
  forageRuns: 2,     // foraging exams per creature, on different layouts
  forageArena: 480,  // arena width and height in pixels
  foragePlants: 40,  // plants in the arena; each eaten plant is replaced elsewhere
  huntTicks: 1200,   // length of one hunting exam (20 s)
  huntArena: 480,
  huntPrey: 4,       // standard prey in the arena; each catch is replaced elsewhere
  preySize: 0.8,     // size gene of the standard prey
  seed: 0x5eed,
};

class Progress {
  constructor() {
    this.clear();
  }

  clear() {
    this.every = PROGRESS.every;
    this.samples = [];
    this.baseline = null;
    this.lastBirths = [0, 0, 0];
    this.lastTopUps = [0, 0, 0];
    this.round = null; // exams under way; not saved, so a world loaded mid-round skips that one sample
  }

  // Runs fn on the fixed exam seed, then puts the world's generator and id counter back.
  static isolated(seed, fn) {
    const state = rng.state, id = Agent.nextId;
    rng.seed(seed);
    try { return fn(); } finally { rng.state = state; Agent.nextId = id; }
  }

  // A bare world for exams: it borrows the Simulation's sensing, steering and eating rules, but none
  // of its population, top-ups or statistics.
  static arena(size, sensorRange) {
    const a = Object.create(Simulation.prototype);
    Object.assign(a, {
      W: size, H: size, sensorRange, drainMult: 1, ticks: 0, particles: null, focus: null,
      agentGrid: new SpatialGrid(), plantGrid: new SpatialGrid(),
      eyeBuf: new Float64Array(PART_SPECS.eye.max * 4),
      counts: [0, 0, 0], fame: [[], [], []],
      species: { leave() {} },
    });
    a.resizeGrids();
    return a;
  }

  // A fresh copy of a creature for an exam: same body and brain weights, its own activations.
  static examinee(genome, brain, x, y) {
    const a = new Agent(genome, x, y, brain.clone());
    a.species = { id: 0 };
    return a;
  }

  // Energy is held at half so hunger never ends an exam early and every examinee feels the same.
  static hold(a) {
    a.energy = a.traits.maxEnergy * 0.5;
    a.age = 0;
  }

  // The exams are generators that yield after every exam tick and return the score, so a round can
  // be run a slice at a time. Each starts by seeding the generator, so every creature gets the same layout.

  // Plants eaten per minute, averaged over PROGRESS.forageRuns layouts.
  static *forage(genome, brain, sensorRange) {
    const P = PROGRESS, S = P.forageArena;
    let eaten = 0;
    for (let run = 0; run < P.forageRuns; run++) {
      rng.seed(P.seed + run);
      const w = Progress.arena(S, sensorRange);
      const spot = () => new Plant(rand(10, S - 10), rand(10, S - 10), 0);
      const plants = Array.from({ length: P.foragePlants }, spot);
      const a = Progress.examinee(genome, brain, S / 2, S / 2);
      w.agents = [a];
      for (let t = 0; t < P.forageTicks; t++) {
        w.ticks++;
        w.plantGrid.build(plants);
        w.agentGrid.build(w.agents);
        Progress.hold(a);
        w.sense(a); a.think(w); a.move(w); w.interact(a);
        for (let i = 0; i < plants.length; i++) if (plants[i].eaten) plants[i] = spot();
        yield;
      }
      eaten += a.meals;
    }
    return eaten / P.forageRuns / (P.forageTicks / TICKS_PER_SEC / 60);
  }

  // Standard prey caught per minute. The prey are founder plant-eaters with untrained brains, the
  // same ones in every exam, and they react to the hunter as their (random) brains dictate.
  static *hunt(genome, brain, sensorRange) {
    const P = PROGRESS, S = P.huntArena;
    rng.seed(P.seed + 99);
    const w = Progress.arena(S, sensorRange);
    const preyGenome = Genome.founder(0);
    preyGenome.genes.size = P.preySize;
    const preyBrains = Array.from({ length: P.huntPrey }, () => new NeuralNetwork(BRAIN_SHAPE));
    const newPrey = i => {
      const p = Progress.examinee(preyGenome, preyBrains[i], rand(20, S - 20), rand(20, S - 20));
      p.slot = i;
      return p;
    };
    const hunter = Progress.examinee(genome, brain, S / 2, S / 2);
    w.agents = [hunter, ...preyBrains.map((_, i) => newPrey(i))];
    w.plants = [];
    w.plantGrid.build(w.plants);
    let caught = 0;
    for (let t = 0; t < P.huntTicks; t++) {
      w.ticks++;
      w.agentGrid.build(w.agents);
      for (const a of w.agents) { Progress.hold(a); w.sense(a); a.think(w); a.move(w); }
      w.interact(hunter);
      for (let i = 1; i < w.agents.length; i++) {
        if (w.agents[i].dead) { caught++; w.agents[i] = newPrey(w.agents[i].slot); }
      }
      yield;
    }
    return caught / (P.huntTicks / TICKS_PER_SEC / 60);
  }

  // Who sits which exam: foraging for bodies that digest plants (plant-eaters, mixed diet),
  // hunting for bodies that can kill (mixed diet, meat-eaters). Index 0 and 1 of each list.
  static groupsFor(exam) {
    return exam === 'forage' ? [0, 1] : [1, 2];
  }

  // Examinees spread evenly through the group (the living world's order is by birth).
  static pick(sim, kind) {
    const members = sim.agents.filter(a => !a.dead && a.kind === kind);
    const n = Math.min(PROGRESS.examinees, members.length);
    return Array.from({ length: n }, (_, i) => members[Math.floor((i + 0.5) * members.length / n)]);
  }

  // Called every tick: starts a round of exams every `every` ticks and works through it a slice at a time.
  step(sim) {
    if (!this.round && sim.ticks % this.every === 0) this.round = this.startRound(sim);
    if (this.round) this.advance();
  }

  // A round: one job per creature and exam. The first round also examines untrained founders
  // (the founders' bodies with fresh random brains) for the baseline.
  startRound(sim) {
    const jobs = [];
    const add = (target, exam, slot, list) => {
      for (const c of list) jobs.push({ target, exam, slot, genome: c.genome, brain: c.brain });
    };
    for (const exam of ['forage', 'hunt']) {
      Progress.groupsFor(exam).forEach((k, slot) => {
        if (!this.baseline) {
          const founders = Progress.isolated(PROGRESS.seed + 7 + k, () => Array.from({ length: PROGRESS.baselineN },
            () => ({ genome: Genome.founder(k), brain: new NeuralNetwork(BRAIN_SHAPE) })));
          add('baseline', exam, slot, founders);
        }
        // Copies of the genome and brain, so mutation or death in the living world cannot touch them.
        add('sample', exam, slot, Progress.pick(sim, k).map(a => ({ genome: a.genome.clone(), brain: a.brain.clone() })));
      });
    }
    // Self-sufficiency: of the creatures added to each group since the last round, the share that
    // were born rather than topped up.
    const self = [0, 1, 2].map(k => {
      const b = sim.births[k] - this.lastBirths[k], t = sim.topUps[k] - this.lastTopUps[k];
      return b + t ? Math.round(100 * b / (b + t)) / 100 : null;
    });
    this.lastBirths = sim.births.slice();
    this.lastTopUps = sim.topUps.slice();
    const tally = () => ({ forage: [[], []], hunt: [[], []] });
    return { t: sim.ticks, self, jobs, i: 0, run: null, state: PROGRESS.seed, id: 1, sensorRange: sim.sensorRange, scores: { baseline: tally(), sample: tally() } };
  }

  advance() {
    const r = this.round, worldState = rng.state, worldId = Agent.nextId;
    rng.state = r.state;
    Agent.nextId = r.id;
    try {
      for (let budget = PROGRESS.slice; budget > 0 && r.i < r.jobs.length; budget--) {
        const job = r.jobs[r.i];
        if (!r.run) r.run = Progress[job.exam](job.genome, job.brain, r.sensorRange);
        const step = r.run.next();
        if (step.done) {
          r.scores[job.target][job.exam][job.slot].push(step.value);
          r.run = null;
          r.i++;
        }
      }
    } finally {
      r.state = rng.state; r.id = Agent.nextId;
      rng.state = worldState; Agent.nextId = worldId;
    }
    if (r.i === r.jobs.length) this.finishRound();
  }

  finishRound() {
    const r = this.round, round2 = v => Math.round(v * 100) / 100;
    const mean = list => list.length ? round2(list.reduce((s, v) => s + v, 0) / list.length) : null;
    const avg = t => ({ forage: t.forage.map(mean), hunt: t.hunt.map(mean) });
    if (!this.baseline) this.baseline = avg(r.scores.baseline);
    this.samples.push({ t: r.t, ...avg(r.scores.sample), self: r.self });
    if (this.samples.length > PROGRESS.maxSamples) this.thin();
    this.round = null;
  }

  // Merge neighbouring samples in pairs and sample half as often, so a long run keeps its whole history.
  thin() {
    const avg = (a, b) => a === null ? b : b === null ? a : (a + b) / 2;
    const merged = [];
    for (let i = 0; i + 1 < this.samples.length; i += 2) {
      const a = this.samples[i], b = this.samples[i + 1];
      merged.push({
        t: b.t,
        forage: a.forage.map((v, k) => avg(v, b.forage[k])),
        hunt: a.hunt.map((v, k) => avg(v, b.hunt[k])),
        self: a.self.map((v, k) => avg(v, b.self[k])),
      });
    }
    if (this.samples.length % 2) merged.push(this.samples[this.samples.length - 1]);
    this.samples = merged;
    this.every *= 2;
  }

  // Values of one series (exam and group index), without gaps.
  series(key, k) {
    const out = [];
    for (const s of this.samples) if (s[key][k] !== null) out.push({ t: s.t, v: s[key][k] });
    return out;
  }

  // Recent level and direction of one series, smoothed over the last few samples.
  static trend(points) {
    if (!points.length) return null;
    const w = Math.max(1, Math.min(8, Math.floor(points.length / 2)));
    const mean = arr => arr.reduce((s, p) => s + p.v, 0) / arr.length;
    const now = mean(points.slice(-w));
    const before = points.length >= 2 * w ? mean(points.slice(-2 * w, -w)) : null;
    const first = mean(points.slice(0, w));
    return { now, before, first };
  }

  toJSON() {
    return { every: this.every, samples: this.samples, baseline: this.baseline, lastBirths: this.lastBirths, lastTopUps: this.lastTopUps };
  }

  load(d) {
    this.clear();
    if (d) Object.assign(this, d);
  }
}
