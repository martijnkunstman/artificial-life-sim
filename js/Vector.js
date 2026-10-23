'use strict';

/* ---------- Vector ---------- */
class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s) { this.x *= s; this.y *= s; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  distSq(v) { const dx = v.x - this.x, dy = v.y - this.y; return dx * dx + dy * dy; }
  static fromAngle(a, m = 1) { return new Vector(Math.cos(a) * m, Math.sin(a) * m); }
}
