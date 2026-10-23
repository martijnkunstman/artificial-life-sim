'use strict';

/* ---------- ViewControls: zoom, pan, follow and the minimap ---------- */
// On the world: drag to pan, wheel or pinch to zoom, click a creature to inspect it, double-click
// to follow it. The minimap shows the whole world with the visible part outlined; click or drag on
// it to move there.
class ViewControls {
  constructor(ui) {
    this.ui = ui;
    this.sim = ui.sim;
    this.cam = ui.sim.renderer.camera;
    const $ = ui.$;
    this.map = ui.setupCanvas($('minimap'));
    this.zoomLabel = $('zoom-level');
    this.followBtn = $('zoom-follow');
    this.lastMap = 0;
    this.pointers = new Map();

    $('zoom-in').addEventListener('click', () => this.cam.zoomAt(1.5));
    $('zoom-out').addEventListener('click', () => this.cam.zoomAt(1 / 1.5));
    $('zoom-fit').addEventListener('click', () => this.cam.fit());
    this.followBtn.addEventListener('click', () => this.toggleFollow());
    this.bindWorld(this.sim.renderer.canvas);
    this.bindMap(this.map.el);
  }

  // Follow the inspected creature, zooming in first if the whole world is in view.
  toggleFollow() {
    const cam = this.cam, a = this.sim.selected;
    if (cam.follow || !a) { cam.follow = null; return; }
    cam.follow = a;
    cam.fitted = false;
    cam.set(a.pos.x, a.pos.y, Math.max(cam.zoom, cam.fitZoom * 2.5));
    this.sim.pinned = true;
  }

  // Keyboard: + and - zoom, 0 shows the whole world, F follows the inspected creature.
  key(e) {
    if (e.key === '+' || e.key === '=') this.cam.zoomAt(1.5);
    else if (e.key === '-' || e.key === '_') this.cam.zoomAt(1 / 1.5);
    else if (e.key === '0') this.cam.fit();
    else if (e.key === 'f' || e.key === 'F') this.toggleFollow();
    else return false;
    return true;
  }

  pick(sx, sy) {
    const [wx, wy] = this.cam.toWorld(sx, sy), reach = 28 / Math.max(1, this.cam.zoom);
    let best = null, bd = reach * reach;
    for (const a of this.sim.agents) {
      const dx = a.pos.x - wx, dy = a.pos.y - wy, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = a; }
    }
    return best;
  }

  bindWorld(el) {
    el.style.touchAction = 'none';
    el.addEventListener('wheel', e => {
      e.preventDefault();
      // Trackpads send many small steps, mouse wheels a few large ones; both zoom smoothly.
      this.cam.zoomAt(Math.exp(-clamp(e.deltaY, -100, 100) * 0.002), e.clientX, e.clientY);
    }, { passive: false });

    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      this.dragged = this.pointers.size > 1;
      this.pinch = null;
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (!this.dragged && Math.hypot(p.x - p.sx, p.y - p.sy) < 5) return;
        this.dragged = true;
        el.style.cursor = 'grabbing';
        this.cam.panBy(dx, dy);
      } else if (this.pointers.size === 2) {
        // Pinch: zoom by the change in finger distance, around the point between the fingers.
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch) {
          this.cam.panBy(mx - this.pinch.mx, my - this.pinch.my);
          this.cam.zoomAt(dist / this.pinch.dist, mx, my);
        }
        this.pinch = { dist, mx, my };
      }
    });
    const end = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      el.style.cursor = '';
      if (e.type === 'pointerup' && !this.dragged && this.pointers.size === 0) {
        const a = this.pick(e.clientX, e.clientY);
        if (a) { this.sim.selected = a; this.sim.pinned = true; }
      }
      if (this.pointers.size < 2) this.pinch = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', e => {
      const a = this.pick(e.clientX, e.clientY);
      if (!a) return;
      this.sim.selected = a;
      this.sim.pinned = true;
      this.cam.follow = null;
      this.toggleFollow();
    });
  }

  bindMap(el) {
    el.style.touchAction = 'none';
    const go = e => {
      const r = el.getBoundingClientRect();
      this.cam.centreOn((e.clientX - r.left) / r.width * this.sim.W, (e.clientY - r.top) / r.height * this.sim.H);
    };
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); this.mapDrag = true; go(e); });
    el.addEventListener('pointermove', e => { if (this.mapDrag) go(e); });
    el.addEventListener('pointerup', () => { this.mapDrag = false; });
    el.addEventListener('pointercancel', () => { this.mapDrag = false; });
  }

  frame(now) {
    const cam = this.cam, sel = this.sim.selected;
    // The followed creature died: keep following, now whichever creature the inspector moved on to.
    if (cam.lostFollow) {
      cam.lostFollow = false;
      if (sel && !sel.dead) cam.follow = sel;
    }
    this.zoomLabel.textContent = `${(cam.zoom / cam.fitZoom).toFixed(1)}×`;
    this.followBtn.setAttribute('aria-pressed', String(!!cam.follow));
    this.followBtn.disabled = !this.sim.selected;
    if (now - this.lastMap > 100) { this.lastMap = now; this.drawMap(); }
  }

  // The whole world: plants as faint specks, creatures as dots in their current colours,
  // the visible part outlined.
  drawMap() {
    const c = this.map, sim = this.sim;
    if (!this.ui.fitCanvas(c)) return;
    const { ctx, w, h } = c, k = w / sim.W;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5, 12, 23, 0.9)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = sim.plantColor;
    ctx.globalAlpha = 0.35;
    for (const p of sim.plants) ctx.fillRect(p.pos.x * k - 0.5, p.pos.y * k - 0.5, 1, 1);
    ctx.globalAlpha = 1;
    const bySpecies = sim.renderer.colorBy === 'species';
    for (const a of sim.agents) {
      ctx.fillStyle = bySpecies ? a.species.color : a.color;
      const r = a.kind === 0 ? 1 : 1.5;
      ctx.fillRect(a.pos.x * k - r, a.pos.y * k - r, 2 * r, 2 * r);
    }
    const a = sim.selected;
    if (a && !a.dead) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.pos.x * k, a.pos.y * k, 4, 0, TAU); ctx.stroke();
    }
    // Outline of what the screen shows, clipped to the world.
    const b = this.cam.bounds(0);
    const x0 = Math.max(0, b.x0) * k, y0 = Math.max(0, b.y0) * k;
    const x1 = Math.min(sim.W, b.x1) * k, y1 = Math.min(sim.H, b.y1) * k;
    if (x1 - x0 < w - 1 || y1 - y0 < h - 1) {
      ctx.strokeStyle = this.ui.col.pos;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.75, y0 + 0.75, x1 - x0 - 1.5, y1 - y0 - 1.5);
    }
    ctx.strokeStyle = this.ui.col.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }
}
