'use strict';

/* ---------- Random: seeded generator (mulberry32) so a seed replays the same world ---------- */
class Random {
  constructor(seed = 1) {
    this.seed(seed);
  }

  seed(s) {
    this.state = s >>> 0;
  }

  // Uniform in [0, 1).
  next() {
    let t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // A fresh seed for a new world; deliberately not drawn from the seeded stream.
  static newSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }
}

// The one generator every simulation rule draws from. Visual-only effects use Math.random instead.
const rng = new Random(1);
