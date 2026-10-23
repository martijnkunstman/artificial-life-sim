'use strict';

/* ---------- Genome: heritable body genes, expressed into the traits an Agent lives by ---------- */
class Genome {
  constructor(genes) {
    this.genes = genes;
  }

  static random(diet = Math.random()) {
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

  mutate(rate, step = EVOLVE.bodyStep) {
    for (const key in this.genes) {
      if (Math.random() >= rate) continue;
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
    const plantEff = 1 - d, meatEff = d;
    const maxEnergy = 110 * Math.pow(s, 1.5);
    const childEnergy = 0.4 * maxEnergy;
    return {
      name: DIET_GROUPS[this.kind],
      radius: 6 * s,
      maxSpeed: 2.2 * v / Math.pow(s, 0.25),
      accel: 0.14 * v,
      maxTurn: 0.15 * t / Math.sqrt(s),
      sense: r,
      maxEnergy,
      startEnergy: 0.6 * maxEnergy,
      reproEnergy: 0.85 * maxEnergy,
      childEnergy,
      reproCost: childEnergy + 0.12 * maxEnergy,
      // A meat diet carries a hunter's metabolism on top of the body's upkeep.
      baseDrain: 0.022 * Math.pow(s, 1.5) + 0.012 * r * r + 0.01 * v * v * s + 0.006 * t * t + 0.03 * d,
      moveDrain: 0.011 * s,
      plantEff,
      meatEff,
      plantGain: plantEff > 0.05 ? 22 * plantEff : 0,
      digest: 150,
      maxAge: 4800 * (0.8 + 0.3 * s),
      bodyValue: 40 * Math.pow(s, 1.5),
    };
  }
}
