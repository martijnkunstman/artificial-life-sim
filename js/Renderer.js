'use strict';

/* ---------- Renderer: glow baked into sprites with shadowBlur, trails via translucent fade ---------- */
const SHAPES = [
  // Herbivore: smooth teardrop
  (g, r) => {
    const cx = -0.35 * r, tip = 1.7 * r, al = Math.acos(r / (tip - cx));
    g.beginPath();
    g.moveTo(tip, 0);
    g.arc(cx, 0, r, -al, al, true);
    g.closePath();
  },
  // Omnivore: curved kite
  (g, r) => {
    g.beginPath();
    g.moveTo(1.7 * r, 0);
    g.quadraticCurveTo(0.2 * r, -1.5 * r, -1.1 * r, -0.85 * r);
    g.quadraticCurveTo(-0.55 * r, 0, -1.1 * r, 0.85 * r);
    g.quadraticCurveTo(0.2 * r, 1.5 * r, 1.7 * r, 0);
    g.closePath();
  },
  // Carnivore: sharp notched arrow
  (g, r) => {
    g.beginPath();
    g.moveTo(2 * r, 0);
    g.lineTo(-1.2 * r, -1.15 * r);
    g.lineTo(-0.45 * r, 0);
    g.lineTo(-1.2 * r, 1.15 * r);
    g.closePath();
  },
];

class Renderer {
  constructor(canvas, overlay, sim) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext('2d');
    this.octx = overlay.getContext('2d');
    this.sim = sim;
    this.resize(sim.W, sim.H);
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.max(1, Math.round(w * this.dpr));
      c.height = Math.max(1, Math.round(h * this.dpr));
    }
    this.buildBackground();
    this.buildSprites();
    this.clear();
  }

  buildBackground() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(c.width * 0.62, c.height * 0.38, 0, c.width * 0.5, c.height * 0.5, Math.hypot(c.width, c.height) * 0.62);
    grd.addColorStop(0, '#0a1a2b');
    grd.addColorStop(0.55, '#050c17');
    grd.addColorStop(1, '#020409');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    this.bg = c;
  }

  makeSprite(r, color, draw) {
    const L = Math.ceil(r * 8), k = this.dpr * 2;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(L * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    g.translate(L / 2, L / 2);
    g.shadowColor = color;
    g.shadowBlur = r * 2.2 * k;
    g.fillStyle = color;
    draw(g, r); g.fill();
    g.fill();
    g.shadowBlur = 0;
    g.translate(0.3 * r, 0);
    g.scale(0.42, 0.42);
    draw(g, r);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fill();
    return { img: c, size: L };
  }

  buildSprites() {
    this.sprites = SPECIES.map((s, k) => this.makeSprite(s.radius, this.sim.colors[k], SHAPES[k]));
    // Evolving mode: one sprite per diet bucket, drawn at a base radius and scaled by each body's size.
    this.dietSprites = Array.from({ length: DIET_BUCKETS }, (_, b) => {
      const d = b / (DIET_BUCKETS - 1);
      return this.makeSprite(DIET_SPRITE_RADIUS, dietColor(d), SHAPES[d < 1 / 3 ? 0 : d < 2 / 3 ? 1 : 2]);
    });
    this.plantSprite = this.makeSprite(PLANT_RADIUS, this.sim.plantColor, (g, r) => { g.beginPath(); g.arc(0, 0, r, 0, TAU); });
  }

  clear() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.bg, 0, 0);
  }

  draw() {
    const ctx = this.ctx, sim = this.sim, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(this.bg, 0, 0);

    // Plants fade in as they sprout.
    const ps = this.plantSprite, half = ps.size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of sim.plants) {
      ctx.globalAlpha = Math.min(1, (sim.ticks - p.born) / 40 + 0.15);
      ctx.drawImage(ps.img, p.pos.x - half, p.pos.y - half, ps.size, ps.size);
    }
    ctx.globalAlpha = 1;

    // Agents, rotated to heading, scaled slightly by energy.
    for (const a of sim.agents) {
      const spr = a.genome ? this.dietSprites[a.bucket] : this.sprites[a.kind], L = spr.size;
      const body = a.genome ? a.traits.radius / DIET_SPRITE_RADIUS : 1;
      const s = (0.75 + 0.45 * a.energy / a.traits.maxEnergy) * body * dpr;
      const c = Math.cos(a.heading) * s, sn = Math.sin(a.heading) * s;
      ctx.setTransform(c, sn, -sn, c, a.pos.x * dpr, a.pos.y * dpr);
      ctx.drawImage(spr.img, -L / 2, -L / 2, L, L);
    }

    // Particles
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const pool = sim.particles.pool;
    for (let i = 0; i < sim.particles.count; i++) {
      const p = pool[i];
      ctx.globalAlpha = p.life / p.span;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.drawOverlay();
  }

  // Selection UI lives on its own fully cleared layer so it never smears into the trails.
  drawOverlay() {
    const o = this.octx, sim = this.sim, a = sim.selected;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!a || a.dead) return;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const x = a.pos.x, y = a.pos.y;
    o.setLineDash([3, 5]);
    o.strokeStyle = 'rgba(180, 215, 245, 0.18)';
    o.lineWidth = 1;
    o.beginPath(); o.arc(x, y, sim.rangeOf(a), 0, TAU); o.stroke();
    o.setLineDash([]);
    const link = (t, color) => {
      if (!t || t.dead || t.eaten) return;
      o.strokeStyle = color; o.globalAlpha = 0.55;
      o.beginPath(); o.moveTo(x, y); o.lineTo(t.pos.x, t.pos.y); o.stroke();
      o.globalAlpha = 1;
    };
    link(a.seePlant, sim.plantColor);
    if (a.seePrey) link(a.seePrey, a.seePrey.color);
    if (a.seePred) link(a.seePred, a.seePred.color);
    o.strokeStyle = a.color;
    o.lineWidth = 1.5;
    o.beginPath(); o.arc(x, y, a.traits.radius * 2.6, 0, TAU); o.stroke();
  }
}
