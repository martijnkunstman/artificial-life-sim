'use strict';

/* ---------- Agent: one creature, sensed by Simulation and steered by its NeuralNetwork ---------- */
class Agent {
  constructor(kind, x, y, brain = null, gen = 0) {
    this.id = Agent.nextId++;
    this.kind = kind;
    this.sp = SPECIES[kind];
    this.pos = new Vector(x, y);
    this.heading = rand(-Math.PI, Math.PI);
    this.speed = rand(0, this.sp.maxSpeed * 0.5);
    this.brain = brain || new NeuralNetwork(BRAIN_SHAPE);
    this.gen = gen;
    this.energy = this.sp.startEnergy;
    this.age = 0;
    this.maxAge = this.sp.maxAge * rand(0.85, 1.15);
    this.meals = 0;
    this.children = 0;
    this.gained = 0;
    this.dead = false;
    this.digest = 0;
    this.inputs = new Float32Array(BRAIN_SHAPE[0]);
    this.turn = 0;
    this.thrust = 0;
    this.seePlant = null; this.dPlant = 0;
    this.seePred = null; this.dPred = 0;
    this.seePrey = null; this.dPrey = 0;
  }

  get fitness() { return this.gained + this.children * 30; }

  encodeTarget(t, d2, slot, range) {
    const inp = this.inputs;
    if (!t) { inp[slot] = 0; inp[slot + 1] = 0; return; }
    const a = Math.atan2(t.pos.y - this.pos.y, t.pos.x - this.pos.x);
    inp[slot] = wrapAngle(a - this.heading) / Math.PI;
    inp[slot + 1] = 1 - Math.sqrt(d2) / range;
  }

  // Fill the sensor vector and let the network decide the steering. No hardcoded behaviour.
  think(sim) {
    const r = sim.sensorRange, inp = this.inputs, x = this.pos.x, y = this.pos.y, h = this.heading;
    this.encodeTarget(this.seePlant, this.dPlant, 0, r);
    this.encodeTarget(this.seePred, this.dPred, 2, r);
    this.encodeTarget(this.seePrey, this.dPrey, 4, r);
    inp[6] = sim.wallProximity(x, y, h, r);
    inp[7] = sim.wallProximity(x, y, h - 0.7, r);
    inp[8] = sim.wallProximity(x, y, h + 0.7, r);
    inp[9] = this.energy / this.sp.maxEnergy;
    inp[10] = this.speed / this.sp.maxSpeed;
    const o = this.brain.forward(inp);
    this.turn = (o[1] - o[0]) * this.sp.maxTurn;
    this.thrust = (o[2] - o[3]) * this.sp.accel;
  }

  move(sim) {
    const sp = this.sp, r = sp.radius;
    this.heading = wrapAngle(this.heading + this.turn);
    this.speed = clamp((this.speed + this.thrust) * 0.99, 0, sp.maxSpeed);
    this.pos.x += Math.cos(this.heading) * this.speed;
    this.pos.y += Math.sin(this.heading) * this.speed;

    let bumped = false;
    if (this.pos.x < r) { this.pos.x = r; bumped = true; }
    else if (this.pos.x > sim.W - r) { this.pos.x = sim.W - r; bumped = true; }
    if (this.pos.y < r) { this.pos.y = r; bumped = true; }
    else if (this.pos.y > sim.H - r) { this.pos.y = sim.H - r; bumped = true; }
    if (bumped) this.speed *= 0.5;

    this.age++;
    if (this.digest > 0) this.digest--;
    this.energy -= (sp.baseDrain + sp.moveDrain * this.speed * this.speed + (bumped ? 0.12 : 0)) * sim.drainMult;
  }

  gain(amount) {
    this.energy = Math.min(this.sp.maxEnergy, this.energy + amount);
    this.gained += amount;
    this.meals++;
  }
}
Agent.nextId = 1;
