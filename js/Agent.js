'use strict';

/* ---------- Agent: one creature, sensed by Simulation and steered by its NeuralNetwork ---------- */
class Agent {
  // The body (traits) is expressed from the genome once at birth; the brain decides what to do with it.
  constructor(genome, x, y, brain = null, gen = 0) {
    this.id = Agent.nextId++;
    this.genome = genome;
    this.traits = genome.express();
    this.kind = genome.kind;
    this.species = null; // set by Simulation.spawnAgent
    this.diet = genome.genes.diet;
    this.bucket = Math.round(this.diet * (DIET_BUCKETS - 1));
    this.color = dietColor(this.diet);
    this.pos = new Vector(x, y);
    this.heading = rand(-Math.PI, Math.PI);
    this.speed = rand(0, this.traits.maxSpeed * 0.5);
    this.brain = brain || new NeuralNetwork(BRAIN_SHAPE);
    this.gen = gen;
    this.energy = this.traits.startEnergy;
    this.age = 0;
    this.maxAge = this.traits.maxAge * rand(0.85, 1.15);
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

  // Everything needed to bring this creature back exactly; sensing is recomputed on the next tick.
  toJSON() {
    return {
      id: this.id, species: this.species.id, genome: this.genome, brain: this.brain, gen: this.gen,
      x: this.pos.x, y: this.pos.y, heading: this.heading, speed: this.speed,
      energy: this.energy, age: this.age, maxAge: this.maxAge, digest: this.digest,
      meals: this.meals, children: this.children, gained: this.gained,
    };
  }

  static fromJSON(d) {
    const a = new Agent(Genome.fromJSON(d.genome), d.x, d.y, NeuralNetwork.fromJSON(d.brain), d.gen);
    a.speciesId = d.species;
    for (const k of ['id', 'heading', 'speed', 'energy', 'age', 'maxAge', 'digest', 'meals', 'children', 'gained']) a[k] = d[k];
    return a;
  }

  // Writes angle and closeness at slot and slot + 1; with sized, also the target's size relative to ours
  // at slot + 2 (0.5 = same size, 1 = twice as big or more). The direction runs the short way round,
  // which may be across the world's seam.
  encodeTarget(sim, t, d2, slot, range, sized = false) {
    const inp = this.inputs;
    if (!t) {
      inp[slot] = 0; inp[slot + 1] = 0;
      if (sized) inp[slot + 2] = 0;
      return;
    }
    const a = Math.atan2(wrapDelta(t.pos.y - this.pos.y, sim.H), wrapDelta(t.pos.x - this.pos.x, sim.W));
    inp[slot] = wrapAngle(a - this.heading) / Math.PI;
    inp[slot + 1] = 1 - Math.sqrt(d2) / range;
    if (sized) inp[slot + 2] = Math.min(1, t.traits.radius / this.traits.radius / 2);
  }

  // Fill the sensor vector (order matches INPUT_LABELS) and let the network decide the steering.
  // No hardcoded behaviour.
  think(sim) {
    const r = sim.rangeOf(this), inp = this.inputs;
    this.encodeTarget(sim, this.seePlant, this.dPlant, 0, r);
    this.encodeTarget(sim, this.seePred, this.dPred, 2, r, true);
    this.encodeTarget(sim, this.seePrey, this.dPrey, 5, r, true);
    inp[8] = this.energy / this.traits.maxEnergy;
    inp[9] = this.traits.digest ? this.digest / this.traits.digest : 0;
    inp[10] = this.speed / this.traits.maxSpeed;
    const o = this.brain.forward(inp);
    this.turn = (o[1] - o[0]) * this.traits.maxTurn;
    this.thrust = (o[2] - o[3]) * this.traits.accel;
  }

  // The world has no edges: swimming off one side comes back in on the opposite side.
  move(sim) {
    const t = this.traits;
    this.heading = wrapAngle(this.heading + this.turn);
    this.speed = clamp((this.speed + this.thrust) * 0.99, 0, t.maxSpeed);
    this.pos.x = wrap(this.pos.x + Math.cos(this.heading) * this.speed, sim.W);
    this.pos.y = wrap(this.pos.y + Math.sin(this.heading) * this.speed, sim.H);

    this.age++;
    if (this.digest > 0) this.digest--;
    this.energy -= (t.baseDrain + t.moveDrain * this.speed * this.speed) * sim.drainMult;
  }

  gain(amount) {
    this.energy = Math.min(this.traits.maxEnergy, this.energy + amount);
    this.gained += amount;
    this.meals++;
  }
}
Agent.nextId = 1;
