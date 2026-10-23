'use strict';

/* ---------- Camera: which part of the wrapping world the screen shows, and how closely ---------- */
// (x, y) is the world point at the centre of the screen; zoom is screen pixels per world pixel.
// "Fit" is the zoom at which the whole world just fits on screen, the furthest out the view goes.
// The world wraps around, so the view pans on forever: x and y stay within the world, and the
// renderer draws everything at its copy nearest the centre of the view.
const MAX_ZOOM = 5;

class Camera {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.viewW = 1;
    this.viewH = 1;
    this.x = worldW / 2;
    this.y = worldH / 2;
    this.zoom = 1;
    this.fitted = true;   // stays fitted to the whole world across window resizes until the viewer zooms
    this.follow = null;   // a creature to keep centred
    this.moved = true;    // set whenever the view changes, so the renderer can drop its trails
  }

  get fitZoom() { return Math.min(this.viewW / this.worldW, this.viewH / this.worldH); }
  get minZoom() { return this.fitZoom; }

  setView(w, h) {
    this.viewW = w;
    this.viewH = h;
    if (this.fitted) this.fit();
    else this.set(this.x, this.y, this.zoom);
  }

  setWorld(w, h) {
    this.worldW = w;
    this.worldH = h;
    this.fit();
  }

  fit() {
    this.follow = null;
    this.fitted = true;
    this.set(this.worldW / 2, this.worldH / 2, this.fitZoom);
  }

  // Keep the zoom in range. Along an axis where the whole world is on screen, the view is centred;
  // otherwise it may pan freely, wrapping around.
  set(x, y, zoom) {
    this.zoom = clamp(zoom, this.minZoom, MAX_ZOOM);
    this.x = this.coversX ? this.worldW / 2 : wrap(x, this.worldW);
    this.y = this.coversY ? this.worldH / 2 : wrap(y, this.worldH);
    this.moved = true;
  }

  // Whether the screen shows the world's whole width (or height); tiny tolerance for rounding.
  get coversX() { return this.viewW / this.zoom >= this.worldW - 0.5; }
  get coversY() { return this.viewH / this.zoom >= this.worldH - 0.5; }

  // The copy of a world point nearest the view's centre (in the same unwrapped space as bounds()).
  nearX(x) { return this.x + wrapDelta(x - this.x, this.worldW); }
  nearY(y) { return this.y + wrapDelta(y - this.y, this.worldH); }

  // Zoom by a factor, keeping the world point under the screen point (sx, sy) where it is.
  zoomAt(factor, sx = this.viewW / 2, sy = this.viewH / 2) {
    const [wx, wy] = this.toWorld(sx, sy);
    const z = clamp(this.zoom * factor, this.minZoom, MAX_ZOOM);
    this.fitted = false;
    // With a followed creature the zoom stays centred on it.
    if (this.follow) { this.set(this.follow.pos.x, this.follow.pos.y, z); return; }
    this.set(wx - (sx - this.viewW / 2) / z, wy - (sy - this.viewH / 2) / z, z);
  }

  panBy(dx, dy) {
    this.follow = null;
    this.fitted = false;
    this.set(this.x - dx / this.zoom, this.y - dy / this.zoom, this.zoom);
  }

  centreOn(wx, wy) {
    this.follow = null;
    this.fitted = false;
    this.set(wx, wy, this.zoom);
  }

  // Called every frame: track the followed creature, and let go of it when it dies
  // (lostFollow tells the controls to pick up whichever creature the inspector shows next).
  update() {
    const f = this.follow;
    if (!f) return;
    if (f.dead) { this.follow = null; this.lostFollow = true; return; }
    if (Math.abs(wrapDelta(f.pos.x - this.x, this.worldW)) > 0.05 || Math.abs(wrapDelta(f.pos.y - this.y, this.worldH)) > 0.05) {
      this.set(f.pos.x, f.pos.y, this.zoom);
    }
  }

  // Screen to world; the result may lie outside the world (a copy across the seam), so wrap it to use it.
  toWorld(sx, sy) {
    return [(sx - this.viewW / 2) / this.zoom + this.x, (sy - this.viewH / 2) / this.zoom + this.y];
  }

  toScreen(wx, wy) {
    return [(wx - this.x) * this.zoom + this.viewW / 2, (wy - this.y) * this.zoom + this.viewH / 2];
  }

  // The visible part of the world, for skipping what is off screen (with a margin for glow and parts).
  bounds(margin = 30) {
    const hw = this.viewW / 2 / this.zoom + margin, hh = this.viewH / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
