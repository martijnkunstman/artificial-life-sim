'use strict';

/* ---------- Simulation: world state, rules, fixed-step loop ---------- */
class Simulation {
  constructor() {
    this.W = Math.max(320, window.innerWidth);
    this.H = Math.max(320, window.innerHeight);
    this.plantRate = 16;
    this.drainMult = 1;
    this.mutationRate = 0.08;
    this.sensorRange = 140;
    this.speed = 1;
    this.agentGrid = new SpatialGrid();
    this.plantGrid = new SpatialGrid();
    this.particles = new ParticleSystem(2400);
    this.groupColors = GROUP_COLOR_VARS.map(cssVar);
    this.plantColor = cssVar('--plant');
    this.renderer = null;
    this.ui = null;
    this.acc = 0;
    this.last = performance.now();
    this.tpsCount = 0;
    this.tpsTime = this.last;
    this.tps = 0;
    this.reset();
  }

  reset() {
    this.ticks = 0;
    this.agents = [];
    this.plants = [];
    this.counts = [0, 0, 0];
    this.births = [0, 0, 0];
    this.plantsSpawned = 0;
    this.fame = [[], [], []];
    this.maxGen = 0;
    this.reseeds = 0;
    this.history = [[], [], [], []];
    this.plantAcc = 0;
    this.selected = null;
    this.pinned = false;
    this.particles.clear();
    this.zones = Array.from({ length: 3 }, () => ({
      x: rand(0.2, 0.8) * this.W, y: rand(0.2, 0.8) * this.H,
      vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25),
    }));
    this.resizeGrids();
    EVOLVE.founders.forEach((n, k) => {
      for (let i = 0; i < n; i++) this.spawnAgent(Genome.founder(k), null, 0);
    });
    for (let i = 0; i < 240; i++) this.spawnPlant();
    if (this.renderer) this.renderer.clear();
  }

  resize(w, h) {
    this.W = w; this.H = h;
    for (const a of this.agents) { a.pos.x = clamp(a.pos.x, 0, w); a.pos.y = clamp(a.pos.y, 0, h); }
    this.plants = this.plants.filter(p => p.pos.x < w && p.pos.y < h);
    for (const z of this.zones) { z.x = clamp(z.x, 0, w); z.y = clamp(z.y, 0, h); }
    this.resizeGrids();
  }

  setSensorRange(r) { this.sensorRange = r; this.resizeGrids(); }

  rangeOf(a) { return this.sensorRange * a.traits.sense; }

  resizeGrids() {
    // Cell size == the longest possible sight, so any neighbour in range is inside the 3x3 block around an agent.
    const cell = Math.max(40, this.sensorRange * GENE_RANGES.sense[1]);
    this.agentGrid.resize(this.W, this.H, cell);
    this.plantGrid.resize(this.W, this.H, cell);
  }

  spawnAgent(genome, brain, gen, x = rand(20, this.W - 20), y = rand(20, this.H - 20)) {
    const a = new Agent(genome, x, y, brain, gen);
    this.agents.push(a);
    this.counts[a.kind]++;
    if (gen > this.maxGen) this.maxGen = gen;
    return a;
  }

  spawnPlant() {
    if (this.plants.length >= PLANT_CAP) return;
    let x, y;
    if (Math.random() < 0.65) {
      // Fertile currents: most growth clusters around slowly drifting zones.
      const z = this.zones[(Math.random() * this.zones.length) | 0];
      const spread = 60 + 0.12 * Math.min(this.W, this.H);
      x = z.x + gauss() * spread;
      y = z.y + gauss() * spread;
    } else {
      x = Math.random() * this.W;
      y = Math.random() * this.H;
    }
    x = clamp(x, 6, this.W - 6);
    y = clamp(y, 6, this.H - 6);
    this.plants.push(new Plant(x, y, this.ticks));
    this.plantsSpawned++;
  }

  wallProximity(x, y, a, r) {
    const c = Math.cos(a), s = Math.sin(a);
    let d = Infinity;
    if (c > 1e-6) d = (this.W - x) / c; else if (c < -1e-6) d = -x / c;
    if (s > 1e-6) d = Math.min(d, (this.H - y) / s); else if (s < -1e-6) d = Math.min(d, -y / s);
    return d >= r ? 0 : 1 - d / r;
  }

  // No fixed food chain: a hunter needs some meat digestion, a clearly more meat-leaning diet
  // than its prey, and a body not much smaller than the prey's.
  canEat(a, b) {
    return a.traits.meatEff >= EVOLVE.minMeatEff
      && b.diet < a.diet - EVOLVE.dietGap
      && b.traits.radius <= a.traits.radius * EVOLVE.sizeRatio;
  }

  // Nearest plant, predator and prey within sensor range, scanning only the 3x3 neighbouring cells.
  sense(a) {
    const range = this.rangeOf(a), r2 = range * range;
    const x = a.pos.x, y = a.pos.y;
    const eatsPlants = a.traits.plantGain > 0;
    const g = this.agentGrid, pg = this.plantGrid;
    const agents = g.items, ahead = g.head, anext = g.next;
    const plants = pg.items, phead = pg.head, pnext = pg.next;
    const span = Math.ceil(range / g.cell);
    const cx = clamp(Math.floor(x / g.cell), 0, g.cols - 1);
    const cy = clamp(Math.floor(y / g.cell), 0, g.rows - 1);
    let bp = null, bpd = r2, bd = null, bdd = r2, by = null, byd = r2;

    for (let gy = Math.max(0, cy - span); gy <= Math.min(g.rows - 1, cy + span); gy++) {
      for (let gx = Math.max(0, cx - span); gx <= Math.min(g.cols - 1, cx + span); gx++) {
        const c = gy * g.cols + gx;
        if (eatsPlants) {
          for (let i = phead[c]; i !== -1; i = pnext[i]) {
            const p = plants[i];
            if (p.eaten) continue;
            const dx = p.pos.x - x, dy = p.pos.y - y, d2 = dx * dx + dy * dy;
            if (d2 < bpd) { bpd = d2; bp = p; }
          }
        }
        for (let i = ahead[c]; i !== -1; i = anext[i]) {
          const o = agents[i];
          if (o === a || o.dead) continue;
          const dx = o.pos.x - x, dy = o.pos.y - y, d2 = dx * dx + dy * dy;
          if (d2 >= bdd && d2 >= byd) continue;
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
      if (a.pos.distSq(p.pos) < rr * rr) {
        p.eaten = true;
        a.gain(t.plantGain);
        this.particles.burst(p.pos.x, p.pos.y, this.plantColor, 6, 1.6, 22, 1.4);
      }
    }
    const q = a.seePrey;
    if (q && !q.dead && a.digest === 0) {
      const rr = t.radius + q.traits.radius;
      if (a.pos.distSq(q.pos) < rr * rr) {
        const leftover = Math.max(0, q.energy);
        a.gain(t.meatEff * (q.traits.bodyValue + leftover * 0.2));
        a.digest = t.digest;
        this.kill(q, true);
      }
    }
  }

  kill(a, eaten) {
    if (a.dead) return;
    a.dead = true;
    this.counts[a.kind]--;
    this.recordFame(a);
    if (eaten) this.particles.burst(a.pos.x, a.pos.y, a.color, 22, 3.4, 34, 2);
    else this.particles.burst(a.pos.x, a.pos.y, a.color, 10, 0.9, 50, 1.4);
  }

  // Hall of fame: the best genomes and brains ever produced, used only to top up a collapsing population.
  recordFame(a) {
    if (a.age < 240) return;
    const list = this.fame[a.kind], f = a.fitness;
    if (list.length >= 12 && f <= list[list.length - 1].fitness) return;
    list.push({ fitness: f, brain: a.brain, genome: a.genome, gen: a.gen });
    list.sort((m, n) => n.fitness - m.fitness);
    if (list.length > 12) list.length = 12;
  }

  reproduce(a) {
    const t = a.traits;
    if (this.agents.length >= EVOLVE.cap) return;
    a.energy -= t.reproCost;
    a.children++;
    const brain = a.brain.clone().mutate(this.mutationRate);
    const genome = a.genome.clone().mutate(this.mutationRate * EVOLVE.bodyMutation);
    const back = a.heading + Math.PI;
    const child = this.spawnAgent(genome, brain, a.gen + 1,
      clamp(a.pos.x + Math.cos(back) * t.radius * 2, 5, this.W - 5),
      clamp(a.pos.y + Math.sin(back) * t.radius * 2, 5, this.H - 5));
    child.energy = Math.min(child.traits.childEnergy, t.childEnergy);
    child.heading = wrapAngle(a.heading + rand(-1.2, 1.2));
    this.births[child.kind]++;
    this.particles.burst(child.pos.x, child.pos.y, child.color, 8, 1.2, 26, 1.2);
  }

  // Tops up one diet group from its best genomes; kind -1 draws from the best of every group.
  reseed(kind) {
    const list = kind < 0 ? this.fame.flat() : this.fame[kind];
    let brain = null, gen = 0;
    let genome = kind < 0 ? Genome.random() : Genome.founder(kind);
    if (list.length) {
      const e = list[(Math.random() * list.length) | 0];
      brain = e.brain.clone().mutate(Math.max(this.mutationRate, 0.05));
      genome = e.genome.clone().mutate(0.2);
      gen = e.gen + 1;
    }
    const a = this.spawnAgent(genome, brain, gen);
    this.reseeds++;
    this.particles.burst(a.pos.x, a.pos.y, a.color, 12, 1.5, 40, 1.4);
  }

  driftZones() {
    for (const z of this.zones) {
      z.x += z.vx; z.y += z.vy;
      if (z.x < 0.1 * this.W || z.x > 0.9 * this.W) z.vx *= -1;
      if (z.y < 0.1 * this.H || z.y > 0.9 * this.H) z.vy *= -1;
      z.x = clamp(z.x, 0, this.W); z.y = clamp(z.y, 0, this.H);
    }
  }

  step() {
    this.ticks++;
    this.driftZones();
    this.plantAcc += this.plantRate / TICKS_PER_SEC;
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
      if (agents.length < EVOLVE.minPop) this.reseed(-1);
    }
    if (this.ticks % 30 === 0) {
      const h = this.history;
      h[0].push(this.counts[0]); h[1].push(this.counts[1]); h[2].push(this.counts[2]); h[3].push(plants.length);
      if (h[0].length > 300) h.forEach(s => s.shift());
    }
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
      this.particles.update();
      this.renderer.draw();
      this.ui.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
