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
    this.colors = SPECIES.map(s => cssVar(s.colorVar));
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
    for (let k = 0; k < SPECIES.length; k++) {
      for (let i = 0; i < SPECIES[k].initial; i++) this.spawnAgent(k, null, 0);
    }
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

  resizeGrids() {
    // Cell size == sensor range, so any neighbour in range is inside the 3x3 block around an agent.
    const cell = Math.max(40, this.sensorRange);
    this.agentGrid.resize(this.W, this.H, cell);
    this.plantGrid.resize(this.W, this.H, cell);
  }

  spawnAgent(kind, brain, gen, x = rand(20, this.W - 20), y = rand(20, this.H - 20)) {
    const a = new Agent(kind, x, y, brain, gen);
    this.agents.push(a);
    this.counts[kind]++;
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

  // Nearest plant, predator and prey within sensor range, scanning only the 3x3 neighbouring cells.
  sense(a) {
    const r2 = this.sensorRange * this.sensorRange;
    const x = a.pos.x, y = a.pos.y;
    const predMask = PREDATORS[a.kind], preyMask = PREY[a.kind], anyMask = predMask | preyMask;
    const eatsPlants = a.sp.plantGain > 0;
    const g = this.agentGrid, pg = this.plantGrid;
    const agents = g.items, ahead = g.head, anext = g.next;
    const plants = pg.items, phead = pg.head, pnext = pg.next;
    const cx = clamp(Math.floor(x / g.cell), 0, g.cols - 1);
    const cy = clamp(Math.floor(y / g.cell), 0, g.rows - 1);
    let bp = null, bpd = r2, bd = null, bdd = r2, by = null, byd = r2;

    for (let gy = Math.max(0, cy - 1); gy <= Math.min(g.rows - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(g.cols - 1, cx + 1); gx++) {
        const c = gy * g.cols + gx;
        if (eatsPlants) {
          for (let i = phead[c]; i !== -1; i = pnext[i]) {
            const p = plants[i];
            if (p.eaten) continue;
            const dx = p.pos.x - x, dy = p.pos.y - y, d2 = dx * dx + dy * dy;
            if (d2 < bpd) { bpd = d2; bp = p; }
          }
        }
        if (anyMask) {
          for (let i = ahead[c]; i !== -1; i = anext[i]) {
            const o = agents[i];
            if (o === a || o.dead) continue;
            const bit = 1 << o.kind;
            if (!(bit & anyMask)) continue;
            const dx = o.pos.x - x, dy = o.pos.y - y, d2 = dx * dx + dy * dy;
            if (bit & predMask) { if (d2 < bdd) { bdd = d2; bd = o; } }
            else if (d2 < byd) { byd = d2; by = o; }
          }
        }
      }
    }
    a.seePlant = bp; a.dPlant = bpd;
    a.seePred = bd; a.dPred = bdd;
    a.seePrey = by; a.dPrey = byd;
  }

  interact(a) {
    const sp = a.sp;
    const p = a.seePlant;
    if (p && !p.eaten) {
      const rr = sp.radius + PLANT_RADIUS + 1;
      if (a.pos.distSq(p.pos) < rr * rr) {
        p.eaten = true;
        a.gain(sp.plantGain);
        this.particles.burst(p.pos.x, p.pos.y, this.plantColor, 6, 1.6, 22, 1.4);
      }
    }
    const q = a.seePrey;
    if (q && !q.dead && a.digest === 0) {
      const rr = sp.radius + q.sp.radius;
      if (a.pos.distSq(q.pos) < rr * rr) {
        a.gain(sp.preyGain + Math.max(0, q.energy) * 0.15);
        a.digest = sp.digest;
        this.kill(q, true);
      }
    }
  }

  kill(a, eaten) {
    if (a.dead) return;
    a.dead = true;
    this.counts[a.kind]--;
    this.recordFame(a);
    const c = this.colors[a.kind];
    if (eaten) this.particles.burst(a.pos.x, a.pos.y, c, 22, 3.4, 34, 2);
    else this.particles.burst(a.pos.x, a.pos.y, c, 10, 0.9, 50, 1.4);
  }

  // Hall of fame: the best brains each species ever produced, used only to reseed near-extinct species.
  recordFame(a) {
    if (a.age < 240) return;
    const list = this.fame[a.kind], f = a.fitness;
    if (list.length >= 12 && f <= list[list.length - 1].fitness) return;
    list.push({ fitness: f, brain: a.brain, gen: a.gen });
    list.sort((m, n) => n.fitness - m.fitness);
    if (list.length > 12) list.length = 12;
  }

  reproduce(a) {
    const sp = a.sp;
    if (this.counts[a.kind] >= sp.cap || this.agents.length >= AGENT_CAP) return;
    a.energy -= sp.reproCost;
    a.children++;
    const brain = a.brain.clone().mutate(this.mutationRate);
    const back = a.heading + Math.PI;
    const child = this.spawnAgent(a.kind, brain, a.gen + 1,
      clamp(a.pos.x + Math.cos(back) * sp.radius * 2, 5, this.W - 5),
      clamp(a.pos.y + Math.sin(back) * sp.radius * 2, 5, this.H - 5));
    child.energy = sp.childEnergy;
    child.heading = wrapAngle(a.heading + rand(-1.2, 1.2));
    this.births[a.kind]++;
    this.particles.burst(child.pos.x, child.pos.y, this.colors[a.kind], 8, 1.2, 26, 1.2);
  }

  reseed(kind) {
    const list = this.fame[kind];
    let brain = null, gen = 0;
    if (list.length) {
      const e = list[(Math.random() * list.length) | 0];
      brain = e.brain.clone().mutate(Math.max(this.mutationRate, 0.05));
      gen = e.gen + 1;
    }
    const a = this.spawnAgent(kind, brain, gen);
    this.reseeds++;
    this.particles.burst(a.pos.x, a.pos.y, this.colors[kind], 12, 1.5, 40, 1.4);
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
      else if (a.energy >= a.sp.reproEnergy) this.reproduce(a);
    }

    let w = 0;
    for (let i = 0; i < agents.length; i++) if (!agents[i].dead) agents[w++] = agents[i];
    agents.length = w;
    w = 0;
    const plants = this.plants;
    for (let i = 0; i < plants.length; i++) if (!plants[i].eaten) plants[w++] = plants[i];
    plants.length = w;

    if (this.ticks % 45 === 0) {
      for (let k = 0; k < SPECIES.length; k++) {
        if (this.counts[k] < SPECIES[k].minPop) this.reseed(k);
      }
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
