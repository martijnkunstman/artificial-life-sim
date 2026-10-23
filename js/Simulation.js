'use strict';

/* ---------- Simulation: world state, rules, fixed-step loop ---------- */
class Simulation {
  // Nothing here touches the DOM, so the same class runs headless in Node (see tools/headless.js).
  // particles is optional: without it the world runs identically, just without visual effects.
  constructor({ width = WORLD_SIZE, height = WORLD_SIZE, seed = Random.newSeed(), particles = null, plantColor = '#e8dc74' } = {}) {
    this.W = width;
    this.H = height;
    this.area = width * height / AREA_UNIT; // populations and plant growth scale with this
    this.plantRate = 16;
    this.drainMult = 1;
    this.mutationRate = 0.08;
    this.sensorRange = 140;
    this.speed = 1;
    this.agentGrid = new SpatialGrid();
    this.plantGrid = new SpatialGrid();
    this.particles = particles;
    this.eyeBuf = new Float64Array(PART_SPECS.eye.max * 4);
    this.plantColor = plantColor;
    this.species = new SpeciesRegistry();
    this.progress = new Progress();
    this.renderer = null;
    this.ui = null;
    this.acc = 0;
    this.last = performance.now();
    this.tpsCount = 0;
    this.tpsTime = this.last;
    this.tps = 0;
    this.reset(seed);
  }

  // The same seed, world size and settings replay the same world tick for tick.
  reset(seed = Random.newSeed()) {
    this.seed = seed >>> 0;
    rng.seed(this.seed);
    Agent.nextId = 1;
    this.ticks = 0;
    this.agents = [];
    this.plants = [];
    this.counts = [0, 0, 0];
    this.births = [0, 0, 0];
    this.plantsSpawned = 0;
    this.fame = [[], [], []];
    this.maxGen = 0;
    this.reseeds = 0;
    this.topUps = [0, 0, 0];
    this.species.clear();
    this.speciesHistory = [];
    this.progress.clear();
    this.plantAcc = 0;
    this.selected = null;
    this.pinned = false;
    this.focus = null;
    if (this.particles) this.particles.clear();
    this.zones = Array.from({ length: Math.max(1, Math.round(ZONES * this.area)) }, () => ({
      x: rand(0, this.W), y: rand(0, this.H),
      vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25),
    }));
    this.resizeGrids();
    // Each diet group's founders start as one species (founders that happen to land far from the
    // first one found species of their own).
    EVOLVE.founders.forEach((n, k) => {
      let first = null;
      for (let i = 0; i < Math.round(n * this.area); i++) {
        const a = this.spawnAgent(Genome.founder(k), null, 0, first);
        first = first || a.species;
      }
    });
    for (let i = 0; i < 240 * this.area; i++) this.spawnPlant();
    if (this.renderer) this.renderer.clear();
  }

  // A complete snapshot: world, statistics, best-genome archive and the random generator's position,
  // so a loaded world continues exactly where it was saved.
  serialize() {
    return {
      format: SAVE_FORMAT, version: VERSION,
      seed: this.seed, rngState: rng.state, ticks: this.ticks,
      width: this.W, height: this.H,
      settings: { plantRate: this.plantRate, drainMult: this.drainMult, mutationRate: this.mutationRate, sensorRange: this.sensorRange },
      agents: this.agents,
      plants: this.plants.map(p => [p.pos.x, p.pos.y, p.born]),
      zones: this.zones, plantAcc: this.plantAcc,
      births: this.births, plantsSpawned: this.plantsSpawned, maxGen: this.maxGen,
      reseeds: this.reseeds, topUps: this.topUps,
      species: this.species, speciesHistory: this.speciesHistory, progress: this.progress,
      fame: this.fame.map(list => list.map(e => ({ fitness: e.fitness, gen: e.gen, species: e.species, genome: e.genome, brain: e.brain }))),
    };
  }

  load(d) {
    if (!d || d.format !== SAVE_FORMAT) throw new Error('That file is not a saved Neural Tidepool world.');
    // Only worlds saved by this exact version load; anything older starts fresh rather than being converted.
    if (d.version !== VERSION) {
      throw new Error(`That world was saved by version ${d.version || 'unknown'}; this is version ${VERSION}, which only opens its own worlds.`);
    }

    Object.assign(this, d.settings);
    this.seed = d.seed;
    this.ticks = d.ticks;
    this.agents = d.agents.map(Agent.fromJSON);
    this.plants = d.plants.map(([x, y, born]) => new Plant(x, y, born));
    this.zones = d.zones;
    this.plantAcc = d.plantAcc;
    this.births = d.births;
    this.plantsSpawned = d.plantsSpawned;
    this.maxGen = d.maxGen;
    this.reseeds = d.reseeds;
    this.topUps = d.topUps;
    this.fame = d.fame.map(list => list.map(e => ({
      fitness: e.fitness, gen: e.gen, species: e.species, genome: Genome.fromJSON(e.genome), brain: NeuralNetwork.fromJSON(e.brain),
    })));
    this.counts = [0, 0, 0];
    for (const a of this.agents) this.counts[a.kind]++;
    this.progress.load(d.progress);
    this.species.load(d.species);
    this.speciesHistory = d.speciesHistory;
    for (const s of this.species.list) s.count = 0;
    for (const a of this.agents) { a.species = this.species.get(a.speciesId); a.species.count++; }
    this.species.alive = this.species.list.filter(s => s.count > 0).length;
    Agent.nextId = this.agents.reduce((m, a) => Math.max(m, a.id), 0) + 1;
    this.selected = null;
    this.pinned = false;
    this.focus = null;
    if (this.particles) this.particles.clear();
    // Restore the generator last: rebuilding the agents above drew from it.
    rng.state = d.rngState >>> 0;
    this.resizeGrids();
    if (this.renderer) this.renderer.clear();
  }

  setSensorRange(r) { this.sensorRange = r; this.resizeGrids(); }

  rangeOf(a) { return this.sensorRange * a.traits.sense; }

  resizeGrids() {
    // Cell size == the longest possible sight, so sense() only scans the 3x3 block around a creature.
    // (Measured: smaller cells with a wider block were slower, because the extra cells cost more than they skip.)
    const cell = Math.max(40, this.sensorRange * PART_SPECS.eye.params.reach[1]);
    this.agentGrid.resize(this.W, this.H, cell);
    this.plantGrid.resize(this.W, this.H, cell);
  }

  // from is the species of the creature's parent (null for none); see SpeciesRegistry.assign.
  spawnAgent(genome, brain, gen, from = null, x = rand(0, this.W), y = rand(0, this.H)) {
    const a = new Agent(genome, x, y, brain, gen);
    this.agents.push(a);
    this.counts[a.kind]++;
    a.species = this.species.assign(genome, from, this.ticks);
    this.species.join(a.species);
    if (gen > this.maxGen) this.maxGen = gen;
    return a;
  }

  spawnPlant() {
    if (this.plants.length >= PLANT_CAP * this.area) return;
    let x, y;
    if (chance(0.65)) {
      // Fertile currents: most growth clusters around slowly drifting zones.
      const z = pick(this.zones);
      x = z.x + gauss() * ZONE_SPREAD;
      y = z.y + gauss() * ZONE_SPREAD;
    } else {
      x = rand(0, this.W);
      y = rand(0, this.H);
    }
    x = wrap(x, this.W);
    y = wrap(y, this.H);
    this.plants.push(new Plant(x, y, this.ticks));
    this.plantsSpawned++;
  }

  // No fixed food chain: a hunter needs some meat digestion, a clearly more meat-leaning diet
  // than its prey, and a body not much smaller than the prey's.
  canEat(a, b) {
    return a.traits.jawRatio > 0
      && a.traits.meatEff >= EVOLVE.minMeatEff
      && b.diet < a.diet - EVOLVE.dietGap
      && b.traits.radius <= a.traits.radius * a.traits.jawRatio;
  }

  // Squared distance between two points, the short way round the wrapping world.
  dist2(p, q) {
    const dx = wrapDelta(q.x - p.x, this.W), dy = wrapDelta(q.y - p.y, this.H);
    return dx * dx + dy * dy;
  }

  // Fill this.eyeBuf with each eye's world direction, cone and squared reach for agent a.
  aimEyes(a) {
    const eyes = a.traits.eyes, buf = this.eyeBuf;
    for (let e = 0; e < eyes.length; e++) {
      const eye = eyes[e], ang = a.heading + eye.angle, reach = this.sensorRange * eye.reach;
      buf[e * 4] = Math.cos(ang);
      buf[e * 4 + 1] = Math.sin(ang);
      buf[e * 4 + 2] = eye.cosWidth;
      buf[e * 4 + 3] = reach * reach;
    }
    return eyes.length;
  }

  // Something is visible when it lies inside any eye's cone and reach, or close enough to touch.
  visible(nEyes, dx, dy, d2, touch2) {
    if (d2 <= touch2) return true;
    const buf = this.eyeBuf;
    let d = -1;
    for (let e = 0; e < nEyes; e++) {
      if (d2 > buf[e * 4 + 3]) continue;
      if (d < 0) d = Math.sqrt(d2);
      if (dx * buf[e * 4] + dy * buf[e * 4 + 1] >= buf[e * 4 + 2] * d) return true;
    }
    return false;
  }

  // Nearest visible plant, predator and prey, scanning only the grid cells that sight can reach (3x3).
  // Only what falls in an eye's cone counts, so where a body's eyes point decides what its brain can react to.
  // The world wraps, so the scan continues across the seam and distances run the short way round.
  sense(a) {
    const range = this.rangeOf(a), r2 = range * range;
    const x = a.pos.x, y = a.pos.y, W = this.W, H = this.H;
    const eatsPlants = a.traits.plantGain > 0;
    const g = this.agentGrid, pg = this.plantGrid;
    const agents = g.items, ahead = g.head, anext = g.next;
    const plants = pg.items, phead = pg.head, pnext = pg.next;
    const spanX = Math.ceil(range / g.cw), spanY = Math.ceil(range / g.ch);
    // On a small world the block may cover every column (or row); then each is scanned once and
    // distances along that axis are wrapped one by one.
    const nx = Math.min(2 * spanX + 1, g.cols), ny = Math.min(2 * spanY + 1, g.rows);
    const allX = nx === g.cols, allY = ny === g.rows;
    const cx = clamp(Math.floor(x / g.cw), 0, g.cols - 1) - (allX ? 0 : spanX);
    const cy = clamp(Math.floor(y / g.ch), 0, g.rows - 1) - (allY ? 0 : spanY);
    let bp = null, bpd = r2, bd = null, bdd = r2, by = null, byd = r2;
    const nEyes = this.aimEyes(a), touch = a.traits.radius * 2.5, touch2 = touch * touch;

    for (let j = 0; j < ny; j++) {
      // A cell beyond the seam holds things whose coordinates are a world's width (or height) away:
      // shift them by that, so plain differences give the short way round (much cheaper than wrapping each).
      let gy = cy + j, oy = y;
      if (gy < 0) { gy += g.rows; oy += H; } else if (gy >= g.rows) { gy -= g.rows; oy -= H; }
      for (let i = 0; i < nx; i++) {
        let gx = cx + i, ox = x;
        if (gx < 0) { gx += g.cols; ox += W; } else if (gx >= g.cols) { gx -= g.cols; ox -= W; }
        const c = gy * g.cols + gx;
        if (eatsPlants) {
          for (let i = phead[c]; i !== -1; i = pnext[i]) {
            const p = plants[i];
            if (p.eaten) continue;
            let dx = p.pos.x - ox, dy = p.pos.y - oy;
            if (allX) dx = wrapDelta(dx, W);
            if (allY) dy = wrapDelta(dy, H);
            const d2 = dx * dx + dy * dy;
            if (d2 < bpd && this.visible(nEyes, dx, dy, d2, touch2)) { bpd = d2; bp = p; }
          }
        }
        for (let i = ahead[c]; i !== -1; i = anext[i]) {
          const o = agents[i];
          if (o === a || o.dead) continue;
          let dx = o.pos.x - ox, dy = o.pos.y - oy;
          if (allX) dx = wrapDelta(dx, W);
          if (allY) dy = wrapDelta(dy, H);
          const d2 = dx * dx + dy * dy;
          if (d2 >= bdd && d2 >= byd) continue;
          if (!this.visible(nEyes, dx, dy, d2, touch2)) continue;
          if (d2 < bdd && this.canEat(o, a)) { bdd = d2; bd = o; }
          else if (d2 < byd && this.canEat(a, o)) { byd = d2; by = o; }
        }
      }
    }
    a.seePlant = bp; a.dPlant = bpd;
    a.seePred = bd; a.dPred = bdd;
    a.seePrey = by; a.dPrey = byd;
  }

  interact(a) {
    const t = a.traits;
    const p = a.seePlant;
    if (p && !p.eaten) {
      const rr = t.radius + PLANT_RADIUS + 1;
      if (this.dist2(a.pos, p.pos) < rr * rr) {
        p.eaten = true;
        a.gain(t.plantGain);
        this.fx(p.pos.x, p.pos.y, this.plantColor, 6, 1.6, 22, 1.4);
      }
    }
    const q = a.seePrey;
    if (q && !q.dead && a.digest === 0) {
      const rr = (t.radius + q.traits.radius) * BODY.biteReach;
      if (this.dist2(a.pos, q.pos) < rr * rr) {
        // Spikes and armour can turn a bite away; spikes also hurt the attacker.
        if (chance(q.traits.defence)) {
          a.energy -= q.traits.spikeDamage;
          a.digest = BODY.recoil;
          this.fx(q.pos.x, q.pos.y, '#ffffff', 6, 2.2, 18, 1.2);
          return;
        }
        const leftover = Math.max(0, q.energy);
        a.gain(t.meatEff * (q.traits.bodyValue + leftover * BODY.leftover));
        a.digest = t.digest;
        this.kill(q, true);
      }
    }
  }

  fx(x, y, color, n, speed, life, size) {
    if (this.particles) this.particles.burst(x, y, color, n, speed, life, size);
  }

  kill(a, eaten) {
    if (a.dead) return;
    a.dead = true;
    this.counts[a.kind]--;
    this.species.leave(a.species, this.ticks);
    if (this.focus === a.species && a.species.count === 0) this.focus = null;
    this.recordFame(a);
    if (eaten) this.fx(a.pos.x, a.pos.y, a.color, 22, 3.4, 34, 2);
    else this.fx(a.pos.x, a.pos.y, a.color, 10, 0.9, 50, 1.4);
  }

  // Hall of fame: the best genomes and brains ever produced, used only to top up a collapsing population.
  recordFame(a) {
    if (a.age < 240) return;
    const list = this.fame[a.kind], f = a.fitness;
    if (list.length >= 12 && f <= list[list.length - 1].fitness) return;
    list.push({ fitness: f, brain: a.brain, genome: a.genome, gen: a.gen, species: a.species.id });
    list.sort((m, n) => n.fitness - m.fitness);
    if (list.length > 12) list.length = 12;
  }

  reproduce(a) {
    const t = a.traits;
    if (this.agents.length >= EVOLVE.cap * this.area) return;
    a.energy -= t.reproCost;
    a.children++;
    const brain = a.brain.clone().mutate(this.mutationRate);
    const genome = a.genome.clone().mutate(this.mutationRate * EVOLVE.bodyMutation);
    const back = a.heading + Math.PI;
    const child = this.spawnAgent(genome, brain, a.gen + 1, a.species,
      wrap(a.pos.x + Math.cos(back) * t.radius * 2, this.W),
      wrap(a.pos.y + Math.sin(back) * t.radius * 2, this.H));
    child.energy = Math.min(child.traits.childEnergy, t.childEnergy);
    child.heading = wrapAngle(a.heading + rand(-1.2, 1.2));
    this.births[child.kind]++;
    this.fx(child.pos.x, child.pos.y, child.color, 8, 1.2, 26, 1.2);
  }

  // Tops up one diet group from its best genomes; kind -1 draws from the best of every group.
  reseed(kind) {
    const list = kind < 0 ? this.fame.flat() : this.fame[kind];
    let brain = null, gen = 0, from = null;
    let genome = kind < 0 ? Genome.random() : Genome.founder(kind);
    if (list.length) {
      const e = pick(list);
      brain = e.brain.clone().mutate(Math.max(this.mutationRate, 0.05));
      genome = e.genome.clone().mutate(0.2);
      gen = e.gen + 1;
      from = this.species.get(e.species);
    }
    const a = this.spawnAgent(genome, brain, gen, from);
    this.reseeds++;
    this.topUps[a.kind]++;
    this.fx(a.pos.x, a.pos.y, a.color, 12, 1.5, 40, 1.4);
  }

  driftZones() {
    for (const z of this.zones) {
      z.x += z.vx; z.y += z.vy;
      z.x = wrap(z.x, this.W); z.y = wrap(z.y, this.H);
    }
  }

  step() {
    this.ticks++;
    this.driftZones();
    this.plantAcc += this.plantRate * this.area / TICKS_PER_SEC;
    while (this.plantAcc >= 1) { this.spawnPlant(); this.plantAcc--; }

    this.plantGrid.build(this.plants);
    this.agentGrid.build(this.agents);

    const agents = this.agents, n = agents.length;
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      if (a.dead) continue;
      this.sense(a);
      a.think(this);
      a.move(this);
      this.interact(a);
      if (a.energy <= 0 || a.age > a.maxAge) this.kill(a, false);
      else if (a.energy >= a.traits.reproEnergy) this.reproduce(a);
    }

    let w = 0;
    for (let i = 0; i < agents.length; i++) if (!agents[i].dead) agents[w++] = agents[i];
    agents.length = w;
    w = 0;
    const plants = this.plants;
    for (let i = 0; i < plants.length; i++) if (!plants[i].eaten) plants[w++] = plants[i];
    plants.length = w;

    if (this.ticks % 45 === 0) {
      for (let k = 0; k < DIET_GROUPS.length; k++) {
        if (this.counts[k] < EVOLVE.groupFloor) this.reseed(k);
      }
      if (agents.length < EVOLVE.minPop * this.area) this.reseed(-1);
    }
    // Species populations for the chart, as flat [id, count, id, count, ...] samples.
    if (this.ticks % 30 === 0) {
      const sample = [];
      for (const s of this.species.list) if (s.count) sample.push(s.id, s.count);
      this.speciesHistory.push(sample);
      if (this.speciesHistory.length > SPECIES.historyLength) this.speciesHistory.shift();
    }
    if (this.ticks % 300 === 0) this.species.prune(this.ticks);
    this.progress.step(this);
    this.tpsCount++;
  }

  start() {
    const frame = now => {
      const dt = Math.min(100, now - this.last);
      this.last = now;
      if (this.speed === 'max') {
        const t0 = performance.now();
        let k = 0;
        do { this.step(); k++; } while (performance.now() - t0 < 11 && k < 600);
        this.acc = 0;
      } else if (this.speed > 0) {
        // deltaTime-scaled fixed timestep: same sim rate on 60 Hz and 144 Hz displays.
        this.acc += this.speed * dt / (1000 / TICKS_PER_SEC);
        let k = 0;
        const limit = this.speed * 4;
        while (this.acc >= 1 && k < limit) { this.step(); this.acc--; k++; }
        if (this.acc > limit) this.acc = 0;
      } else {
        this.acc = 0;
      }
      if (now - this.tpsTime >= 1000) {
        this.tps = Math.round(this.tpsCount * 1000 / (now - this.tpsTime));
        this.tpsCount = 0;
        this.tpsTime = now;
      }
      if (this.particles) this.particles.update();
      this.renderer.draw();
      this.ui.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
