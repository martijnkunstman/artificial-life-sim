'use strict';

/* ---------- Genome: heritable body (size, diet and a list of parts), expressed into the traits an Agent lives by ---------- */
class Genome {
  constructor(genes, parts) {
    this.genes = genes;
    this.parts = parts;
  }

  static randomPart(type = pick(PART_TYPES)) {
    const part = { type };
    for (const [key, [lo, hi]] of Object.entries(PART_SPECS[type].params)) part[key] = rand(lo, hi);
    return part;
  }

  // A founder body for one diet group: the group's template with jitter on size, diet and every part.
  static founder(kind) {
    const parts = FOUNDER_PARTS[kind].map(p => {
      const part = { ...p };
      for (const [key, [lo, hi]] of Object.entries(PART_SPECS[p.type].params)) {
        part[key] = Genome.nudge(key, part[key] + gauss() * 0.08 * (hi - lo), lo, hi);
      }
      return part;
    });
    return new Genome({ size: rand(0.8, 1.25), diet: clamp(FOUNDER_DIETS[kind] + gauss() * 0.06, 0, 1) }, parts);
  }

  // Founder of whichever diet group the given diet falls in.
  static random(diet = rng.next()) {
    const g = Genome.founder(diet < 1 / 3 ? 0 : diet < 2 / 3 ? 1 : 2);
    g.genes.diet = clamp(diet, 0, 1);
    return g;
  }

  // Angles wrap around the body; every other parameter is clamped to its range.
  static nudge(key, v, lo, hi) {
    return key === 'angle' ? wrapAngle(v) : clamp(v, lo, hi);
  }

  clone() {
    return new Genome({ ...this.genes }, this.parts.map(p => ({ ...p })));
  }

  toJSON() {
    return { genes: this.genes, parts: this.parts };
  }

  static fromJSON(d) {
    return new Genome({ ...d.genes }, d.parts.map(p => ({ ...p })));
  }

  count(type) {
    let n = 0;
    for (const p of this.parts) if (p.type === type) n++;
    return n;
  }

  mutate(rate, step = EVOLVE.bodyStep) {
    for (const key in this.genes) {
      if (!chance(rate)) continue;
      const [lo, hi] = GENE_RANGES[key];
      this.genes[key] = clamp(this.genes[key] + gauss() * step * (hi - lo), lo, hi);
    }
    for (const p of this.parts) {
      for (const [key, [lo, hi]] of Object.entries(PART_SPECS[p.type].params)) {
        if (chance(rate)) p[key] = Genome.nudge(key, p[key] + gauss() * step * (hi - lo), lo, hi);
      }
    }
    if (this.parts.length < MAX_PARTS && chance(rate * EVOLVE.partAdd)) {
      const type = pick(PART_TYPES);
      if (this.count(type) < PART_SPECS[type].max) this.parts.push(Genome.randomPart(type));
    }
    if (this.parts.length && chance(rate * EVOLVE.partRemove)) {
      this.parts.splice((rng.next() * this.parts.length) | 0, 1);
    }
    return this;
  }

  get kind() {
    const d = this.genes.diet;
    return d < 1 / 3 ? 0 : d < 2 / 3 ? 1 : 2;
  }

  // Every part buys something and costs mass and upkeep; mass slows the body and raises its running cost.
  express() {
    const { size: s, diet: d } = this.genes;
    const B = BODY;
    let partMass = 0, upkeep = 0, thrust = 0, steer = 0, jaw = 0, spikes = 0, armour = 0, fat = 0, sight = 0;
    const eyes = [];
    for (const p of this.parts) {
      switch (p.type) {
        case 'eye':
          // Seeing further or wider costs more; the cone is checked with a dot product, hence cos(width).
          eyes.push({ angle: p.angle, reach: p.reach, width: p.width, cosWidth: Math.cos(p.width) });
          sight = Math.max(sight, p.reach);
          upkeep += 0.008 * p.reach * p.reach * (0.4 + 0.6 * p.width / 1.6);
          partMass += 0.04 * p.reach;
          break;
        case 'fin':
          // Fins pointing backward push; fins on the flanks steer.
          thrust += p.power * Math.abs(Math.cos(p.angle));
          steer += p.power * Math.abs(Math.sin(p.angle));
          upkeep += 0.006 * p.power * p.power;
          partMass += 0.08 * p.power;
          break;
        case 'jaw':
          jaw = Math.max(jaw, p.power);
          upkeep += 0.004 * p.power;
          partMass += 0.06 * p.power;
          break;
        case 'spike':
          spikes += p.length;
          upkeep += 0.002 * p.length;
          partMass += 0.05 * p.length;
          break;
        case 'armour':
          armour += p.thickness;
          upkeep += 0.002 * p.thickness;
          partMass += 0.15 * p.thickness;
          break;
        case 'fat':
          fat += p.amount;
          upkeep += 0.001 * p.amount;
          partMass += 0.2 * p.amount;
          break;
      }
    }
    const mass = Math.pow(s, 1.5) * (1 + partMass);
    const plantEff = Math.pow(1 - d, B.dietCurve), meatEff = Math.pow(d, B.dietCurve);
    const maxEnergy = 110 * Math.pow(s, 1.5) * (1 + 0.4 * fat);
    // Hunters raise fewer, better-provisioned young: a newborn hunter needs time to make its first kill.
    const childEnergy = (0.4 + B.hunterProvision * d) * maxEnergy;
    // A meat diet brings a hunter's burst of speed; without it a chaser never gains on fleeing prey.
    const hunter = 1 + B.hunterSpeed * d;
    return {
      name: DIET_GROUPS[this.kind],
      radius: 6 * s,
      mass,
      maxSpeed: (0.4 + 1.2 * thrust / Math.sqrt(mass)) * hunter,
      accel: (0.02 + 0.08 * thrust / mass) * hunter,
      maxTurn: 0.05 + 0.08 * steer / Math.sqrt(mass),
      // Longest eye reach (a blind body still feels walls close by).
      sense: Math.max(0.3, sight),
      eyes,
      jawRatio: jaw ? 0.9 + 0.5 * jaw : 0,
      defence: Math.min(B.maxDefence, B.spikeDefence * spikes + B.armourDefence * armour),
      spikeDamage: B.spikeDamage * spikes,
      maxEnergy,
      startEnergy: Math.max(0.6 * maxEnergy, childEnergy),
      // Breed only with enough left over to survive the cost (0.85 of max for a plant-eater).
      reproEnergy: Math.min(0.98 * maxEnergy, childEnergy + 0.45 * maxEnergy),
      childEnergy,
      reproCost: childEnergy + 0.12 * maxEnergy,
      // A meat diet carries a hunter's metabolism on top of the body's and the parts' upkeep.
      baseDrain: 0.022 * mass + upkeep + B.meatUpkeep * d,
      moveDrain: 0.011 * mass,
      plantEff,
      meatEff,
      plantGain: plantEff > 0.05 ? B.plantValue * plantEff : 0,
      digest: B.digest,
      maxAge: 4800 * (0.8 + 0.3 * s),
      bodyValue: B.bodyValue * mass,
    };
  }
}
