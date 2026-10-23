'use strict';

/* ---------- Plant: a food pellet that sprouts and gets eaten ---------- */
class Plant {
  constructor(x, y, tick) {
    this.pos = new Vector(x, y);
    this.born = tick;
    this.eaten = false;
  }
}
