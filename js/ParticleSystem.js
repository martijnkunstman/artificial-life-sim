'use strict';

/* ---------- particles: fixed pool, swap-remove ---------- */
class ParticleSystem {
  constructor(max) {
    this.max = max;
    this.pool = Array.from({ length: max }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, span: 1, size: 1, color: '#fff' }));
    this.count = 0;
  }
  burst(x, y, color, n, speed, life, size = 1.6) {
    if (REDUCED_MOTION) n = Math.ceil(n * 0.3);
    for (let k = 0; k < n && this.count < this.max; k++) {
      const p = this.pool[this.count++];
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.span = p.life = life * (0.6 + Math.random() * 0.4);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = color;
    }
  }
  update() {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      if (--p.life <= 0) {
        this.pool[i] = this.pool[--this.count];
        this.pool[this.count] = p;
        i--;
        continue;
      }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.93; p.vy *= 0.93;
    }
  }
  clear() { this.count = 0; }
}
