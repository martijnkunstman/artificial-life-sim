'use strict';

/* ---------- Genome: heritable body genes, expressed into the traits an Agent lives by ---------- */
class Genome {
  constructor(genes) {
    this.genes = genes;
  }

  static random(diet = rng.next()) {
    return new Genome({
      size: rand(0.8, 1.25),
      speed: rand(0.8, 1.2),
      turn: rand(0.8, 1.2),
      sense: rand(0.8, 1.2),
      diet: clamp(diet, 0, 1),
    });
  }

  // A random body whose diet sits inside one of the three diet groups.
  static founder(kind) {
    return Genome.random(FOUNDER_DIETS[kind] + gauss() * 0.06);
  }

  clone() {
    return new Genome({ ...this.genes });
  }

  toJSON() {
    return this.genes;
  }

  static fromJSON(genes) {
    return new Genome({ ...genes });
  }

  mutate(rate, step = EVOLVE.bodyStep) {
    for (const key in this.genes) {
      if (!chance(rate)) continue;
      const [lo, hi] = GENE_RANGES[key];
      this.genes[key] = clamp(this.genes[key] + gauss() * step * (hi - lo), lo, hi);
    }
    return this;
  }

  get kind() {
    const d = this.genes.diet;
    return d < 1 / 3 ? 0 : d < 2 / 3 ? 1 : 2;
  }

  // Every advantage has a price: bigger bodies store more but cost more and turn slower,
  // sharper senses and stronger muscles raise upkeep, and diet trades plant against meat digestion.
  express() {
    const { size: s, speed: v, turn: t, sense: r, diet: d } = this.genes;
    const B = BODY;
    const plantEff = Math.pow(1 - d, B.dietCurve), meatEff = Math.pow(d, B.dietCurve);
    const maxEnergy = 110 * Math.pow(s, 1.5);
    // Hunters raise fewer, better-provisioned young: a newborn hunter needs time to make its first kill.
    const childEnergy = (0.4 + B.hunterProvision * d) * maxEnergy;
    return {
      name: DIET_GROUPS[this.kind],
      radius: 6 * s,
      // A meat diet brings a hunter's burst of speed; without it a chaser never gains on fleeing prey.
      maxSpeed: 2.2 * v / Math.pow(s, 0.25) * (1 + B.hunterSpeed * d),
      accel: 0.14 * v * (1 + B.hunterSpeed * d),
      maxTurn: 0.15 * t / Math.sqrt(s),
      sense: r,
      maxEnergy,
      startEnergy: Math.max(0.6 * maxEnergy, childEnergy),
      // Breed only with enough left over to survive the cost (0.85 of max for a plant-eater).
      reproEnergy: Math.min(0.98 * maxEnergy, childEnergy + 0.45 * maxEnergy),
      childEnergy,
      reproCost: childEnergy + 0.12 * maxEnergy,
      // A meat diet carries a hunter's metabolism on top of the body's upkeep.
      baseDrain: 0.022 * Math.pow(s, 1.5) + 0.012 * r * r + 0.01 * v * v * s + 0.006 * t * t + B.meatUpkeep * d,
      moveDrain: 0.011 * s,
      plantEff,
      meatEff,
      plantGain: plantEff > 0.05 ? B.plantValue * plantEff : 0,
      digest: B.digest,
      maxAge: 4800 * (0.8 + 0.3 * s),
      bodyValue: B.bodyValue * Math.pow(s, 1.5),
    };
  }
}
