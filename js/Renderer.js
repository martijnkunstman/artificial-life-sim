'use strict';

/* ---------- Renderer: glow baked into sprites with shadowBlur, trails via translucent fade ---------- */
// The canvas covers the window; the Camera decides which part of the fixed square world it shows.
const SHAPES = [
  // Plant-eaters: smooth teardrop
  (g, r) => {
    const cx = -0.35 * r, tip = 1.7 * r, al = Math.acos(r / (tip - cx));
    g.beginPath();
    g.moveTo(tip, 0);
    g.arc(cx, 0, r, -al, al, true);
    g.closePath();
  },
  // Mixed diet: curved kite
  (g, r) => {
    g.beginPath();
    g.moveTo(1.7 * r, 0);
    g.quadraticCurveTo(0.2 * r, -1.5 * r, -1.1 * r, -0.85 * r);
    g.quadraticCurveTo(-0.55 * r, 0, -1.1 * r, 0.85 * r);
    g.quadraticCurveTo(0.2 * r, 1.5 * r, 1.7 * r, 0);
    g.closePath();
  },
  // Meat-eaters: sharp notched arrow
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
    this.colorBy = 'species'; // or 'diet'
    this.camera = new Camera(sim.W, sim.H);
    this.buildBackground();
  }

  // w and h are the window's size in CSS pixels.
  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
    }
    if (dpr !== this.dpr) { this.dpr = dpr; this.buildSprites(); }
    this.camera.setView(w, h);
    this.clear();
  }

  // The world's backdrop, drawn once small and stretched over the world (a soft gradient scales well).
  buildBackground() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(c.width * 0.62, c.height * 0.38, 0, c.width * 0.5, c.height * 0.5, Math.hypot(c.width, c.height) * 0.62);
    grd.addColorStop(0, '#0a1a2b');
    grd.addColorStop(0.55, '#050c17');
    grd.addColorStop(1, '#020409');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    this.bg = c;
  }

  // Maps world coordinates to device pixels: device = world * scale + offset.
  view() {
    const cam = this.camera, dpr = this.dpr, scale = cam.zoom * dpr;
    return { scale, ox: (cam.viewW / 2 - cam.x * cam.zoom) * dpr, oy: (cam.viewH / 2 - cam.y * cam.zoom) * dpr };
  }

  // Outside the world is darker than the world's own backdrop; alpha below 1 leaves fading trails.
  paintBackdrop(alpha) {
    const ctx = this.ctx, sim = this.sim, { scale, ox, oy } = this.view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#010205';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.drawImage(this.bg, 0, 0, sim.W, sim.H);
    ctx.globalAlpha = 1;
  }

  // Baked at three times the device resolution, so sprites stay sharp when zoomed in.
  makeSprite(r, color, draw) {
    const L = Math.ceil(r * 8), k = this.dpr * 3;
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
    // One sprite per diet bucket, drawn at a base radius and scaled by each body's size.
    this.dietSprites = Array.from({ length: DIET_BUCKETS }, (_, b) => {
      const d = b / (DIET_BUCKETS - 1);
      return this.makeSprite(DIET_SPRITE_RADIUS, dietColor(d), SHAPES[d < 1 / 3 ? 0 : d < 2 / 3 ? 1 : 2]);
    });
    this.hueSprites = new Map();
    this.plantSprite = this.makeSprite(PLANT_RADIUS, this.sim.plantColor, (g, r) => { g.beginPath(); g.arc(0, 0, r, 0, TAU); });
  }

  // Species colours: one sprite per shape and hue step, baked the first time a species needs it.
  speciesSprite(s, shape) {
    const hue = Math.round(s.hue / 8) * 8 % 360, key = shape * 360 + hue;
    let spr = this.hueSprites.get(key);
    if (!spr) {
      spr = this.makeSprite(DIET_SPRITE_RADIUS, `hsl(${hue}, 100%, 67%)`, SHAPES[shape]);
      this.hueSprites.set(key, spr);
    }
    return spr;
  }

  clear() {
    this.camera.moved = true;
  }

  draw() {
    const ctx = this.ctx, sim = this.sim, cam = this.camera;
    cam.update();
    ctx.globalCompositeOperation = 'source-over';
    // Trails only make sense while the view holds still; after a pan or zoom, repaint fully.
    this.paintBackdrop(cam.moved ? 1 : 0.3);
    cam.moved = false;
    const { scale, ox, oy } = this.view(), b = cam.bounds();
    const inView = (x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

    // The world's edge.
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.strokeStyle = 'rgba(140, 182, 224, 0.25)';
    ctx.lineWidth = 1 / cam.zoom;
    ctx.strokeRect(0, 0, sim.W, sim.H);

    // Plants fade in as they sprout.
    const ps = this.plantSprite, half = ps.size / 2;
    for (const p of sim.plants) {
      if (!inView(p.pos.x, p.pos.y)) continue;
      ctx.globalAlpha = Math.min(1, (sim.ticks - p.born) / 40 + 0.15);
      ctx.drawImage(ps.img, p.pos.x - half, p.pos.y - half, ps.size, ps.size);
    }
    ctx.globalAlpha = 1;

    // Agents, rotated to heading, scaled slightly by energy. Shape always follows the diet group;
    // colour follows either the species or the diet.
    const bySpecies = this.colorBy === 'species';
    for (const a of sim.agents) {
      if (!inView(a.pos.x, a.pos.y)) continue;
      const spr = bySpecies ? this.speciesSprite(a.species, a.kind) : this.dietSprites[a.bucket], L = spr.size;
      const body = a.traits.radius / DIET_SPRITE_RADIUS;
      const s = (0.75 + 0.45 * a.energy / a.traits.maxEnergy) * body * scale;
      const c = Math.cos(a.heading) * s, sn = Math.sin(a.heading) * s;
      ctx.setTransform(c, sn, -sn, c, a.pos.x * scale + ox, a.pos.y * scale + oy);
      ctx.drawImage(spr.img, -L / 2, -L / 2, L, L);
      this.drawParts(ctx, a, bySpecies ? a.species.color : a.color);
    }

    // Particles
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    const pool = sim.particles.pool;
    for (let i = 0; i < sim.particles.count; i++) {
      const p = pool[i];
      if (!inView(p.x, p.y)) continue;
      ctx.globalAlpha = p.life / p.span;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.drawOverlay();
  }

  // Parts drawn in the creature's own frame (heading along +x, body radius DIET_SPRITE_RADIUS).
  // Each sits on an ellipse that roughly follows the body outline.
  drawParts(ctx, a, color) {
    const parts = a.genome.parts, R = DIET_SPRITE_RADIUS;
    const edge = ang => [Math.cos(ang) * R * 1.35, Math.sin(ang) * R];
    ctx.lineCap = 'round';
    let spikeIndex = 0;
    const spikeCount = a.genome.count('spike');
    for (const p of parts) {
      switch (p.type) {
        case 'fin': {
          const [x, y] = edge(p.angle), len = R * (0.55 + 0.5 * p.power);
          // Points outward from where it sits, swept halfway toward the tail.
          const side = p.angle >= 0 ? 1 : -1;
          const back = p.angle + (Math.PI - Math.abs(p.angle)) * 0.5 * side;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(p.angle + 1.2) * 2, y + Math.sin(p.angle + 1.2) * 2);
          ctx.lineTo(x + Math.cos(back) * len, y + Math.sin(back) * len);
          ctx.lineTo(x + Math.cos(p.angle - 1.2) * 2, y + Math.sin(p.angle - 1.2) * 2);
          ctx.fill();
          break;
        }
        case 'eye': {
          const [x, y] = edge(p.angle);
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(x * 0.8, y * 0.8, 1.2 + 0.5 * p.reach, 0, TAU); ctx.fill();
          ctx.fillStyle = '#04101c';
          ctx.beginPath(); ctx.arc(x * 0.8 + Math.cos(p.angle) * 0.6, y * 0.8 + Math.sin(p.angle) * 0.6, 0.7, 0, TAU); ctx.fill();
          break;
        }
        case 'jaw': {
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1 + 0.6 * p.power;
          const tip = R * 1.7, len = 2 + 3 * p.power;
          ctx.beginPath();
          ctx.moveTo(tip - 3, -2.4); ctx.quadraticCurveTo(tip + len * 0.6, -2.6, tip + len, -0.6);
          ctx.moveTo(tip - 3, 2.4); ctx.quadraticCurveTo(tip + len * 0.6, 2.6, tip + len, 0.6);
          ctx.stroke();
          break;
        }
        case 'spike': {
          // Spikes have no direction gene; spread them evenly around the body.
          const ang = (spikeIndex++ + 0.5) / spikeCount * TAU;
          const [x, y] = edge(ang), len = 2 + 3.5 * p.length;
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
          break;
        }
        case 'armour':
          ctx.strokeStyle = 'rgba(200, 225, 255, 0.55)';
          ctx.globalAlpha = 1;
          ctx.lineWidth = 0.8 + 0.9 * p.thickness;
          ctx.beginPath(); ctx.ellipse(0, 0, R * 1.45, R * 1.12, 0, 0, TAU); ctx.stroke();
          break;
        case 'fat':
          ctx.fillStyle = 'rgba(255, 236, 170, 0.35)';
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.ellipse(-R * 0.3, 0, R * 0.45 * p.amount, R * 0.35 * p.amount, 0, 0, TAU); ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // Selection UI lives on its own fully cleared layer so it never smears into the trails.
  drawOverlay() {
    const o = this.octx, sim = this.sim, a = sim.selected;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const { scale, ox, oy } = this.view(), px = 1 / this.camera.zoom; // one screen pixel, in world units
    o.setTransform(scale, 0, 0, scale, ox, oy);
    // Every member of the species picked in the panel or the family tree.
    const f = sim.focus;
    if (f) {
      o.strokeStyle = f.color;
      o.lineWidth = 1.2 * px;
      o.globalAlpha = 0.8;
      o.beginPath();
      for (const m of sim.agents) {
        if (m.species !== f) continue;
        const r = m.traits.radius * 2.2 + 3;
        o.moveTo(m.pos.x + r, m.pos.y);
        o.arc(m.pos.x, m.pos.y, r, 0, TAU);
      }
      o.stroke();
      o.globalAlpha = 1;
    }
    if (!a || a.dead) return;
    const x = a.pos.x, y = a.pos.y;
    // What the creature can see: one wedge per eye.
    o.lineWidth = px;
    for (const eye of a.traits.eyes) {
      const mid = a.heading + eye.angle, r = sim.sensorRange * eye.reach;
      o.fillStyle = 'rgba(180, 215, 245, 0.05)';
      o.strokeStyle = 'rgba(180, 215, 245, 0.22)';
      o.beginPath();
      o.moveTo(x, y);
      o.arc(x, y, r, mid - eye.width, mid + eye.width);
      o.closePath();
      o.fill();
      o.stroke();
    }
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
    o.lineWidth = 1.5 * px;
    o.beginPath(); o.arc(x, y, a.traits.radius * 2.6, 0, TAU); o.stroke();
  }
}
