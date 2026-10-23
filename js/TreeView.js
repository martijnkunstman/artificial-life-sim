'use strict';

/* ---------- TreeView: the family tree of species, drawn against time ---------- */
// One row per species, in SpeciesRegistry.order(). A species' line runs from when it was founded to
// when it died out (or to now); a short vertical line joins it to its parent's row at the moment it
// branched off. Living lines are drawn in the species' colour, thicker the more members it has.
// To keep a long run readable, only a few generations of ancestors are shown (the Ancestors setting),
// and the time axis starts shortly before the oldest living or recently extinct species was founded.
// Ancestors that died out before that are left out; a species whose parent is hidden starts with a
// dotted stub, and lines that began earlier are cut at the left edge with a small arrow.
class TreeView {
  constructor(ui) {
    this.ui = ui;
    this.sim = ui.sim;
    const $ = ui.$;
    this.panel = $('tree-panel');
    this.scroll = $('tree-scroll');
    this.info = $('tree-info');
    this.extinct = $('tree-extinct');
    this.levels = $('tree-levels');
    this.c = ui.setupCanvas($('tree'));
    this.rows = [];
    this.hover = null;
    this.pad = 6;
    this.rowH = 10;
    this.lastDraw = 0;

    this.c.el.addEventListener('mousemove', e => this.setHover(this.rowAt(e)));
    this.c.el.addEventListener('mouseleave', () => this.setHover(null));
    this.c.el.addEventListener('click', e => {
      const s = this.rowAt(e);
      if (s) ui.setFocus(this.sim.focus === s ? null : s);
    });
    this.extinct.addEventListener('change', () => this.draw());
    this.levels.addEventListener('change', () => this.draw());
    $('tree-close').addEventListener('click', () => this.toggle(false));
  }

  get open() { return !this.panel.hidden; }

  toggle(open = !this.open) {
    this.panel.hidden = !open;
    this.ui.$('tree-open').setAttribute('aria-expanded', String(open));
    if (open) this.draw();
  }

  rowAt(e) {
    const r = this.c.el.getBoundingClientRect();
    const i = Math.floor((e.clientY - r.top - this.pad) / this.rowH);
    return this.rows[i] || null;
  }

  setHover(s) {
    if (s === this.hover) return;
    this.hover = s;
    this.c.el.style.cursor = s ? 'pointer' : '';
    this.draw();
  }

  frame(now) {
    if (this.open && now - this.lastDraw > 500) this.draw();
  }

  draw() {
    this.lastDraw = performance.now();
    if (!this.open) return;
    const sim = this.sim, sp = sim.species, ui = this.ui;
    const showExtinct = this.extinct.checked;
    // Extinct branches are those that died out recently (as long as the registry keeps dead ends);
    // ones that never grew past a couple of members are left out unless something descends from
    // them, since most are single newborns that died before breeding.
    const levels = this.levels.value === 'all' ? Infinity : Number(this.levels.value);
    const now = sim.ticks;
    const keep = s => s.count > 0 || (showExtinct && s.peak >= TreeView.minPeak && now - s.died <= SPECIES.keepExtinct);
    let first = now;
    for (const s of sp.list) if (keep(s) && s.born < first) first = s.born;
    const t0 = levels === Infinity ? 0 : Math.max(0, first - 0.15 * (now - first));
    this.rows = sp.order(keep, levels, a => a.count > 0 || a.died >= t0);
    const rows = this.rows, n = rows.length;

    // Rows share the visible height, but never get thinner than 5px; beyond that the list scrolls.
    const avail = Math.max(120, this.scroll.clientHeight) - 2 * this.pad;
    this.rowH = clamp(avail / Math.max(1, n), 5, 16);
    this.c.el.style.height = `${Math.ceil(n * this.rowH + 2 * this.pad)}px`;
    if (!ui.fitCanvas(this.c)) return;
    const { ctx, w, h } = this.c, rowH = this.rowH, pad = this.pad;
    ctx.clearRect(0, 0, w, h);

    const left = 4, right = w - 92;
    const X = t => left + (right - left) * (now > t0 ? Math.max(0, t - t0) / (now - t0) : 1);
    const Y = i => pad + (i + 0.5) * rowH;
    const index = new Map(rows.map((s, i) => [s, i]));
    ui.$('tree-t0').textContent = formatTicks(t0);
    ui.$('tree-t1').textContent = formatTicks(now);

    // Bands behind the focused and hovered species.
    for (const [s, alpha] of [[sim.focus, 0.16], [this.hover, 0.1]]) {
      if (!s || !index.has(s)) continue;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, pad + index.get(s) * rowH, w, rowH);
    }
    ctx.globalAlpha = 1;

    const muted = ui.col.muted;
    ctx.lineCap = 'round';
    rows.forEach((s, i) => {
      const alive = s.count > 0, x0 = X(s.born), x1 = X(alive ? now : s.died), y = Y(i);
      const p = sp.get(s.parent);
      ctx.strokeStyle = alive ? s.color : muted;
      ctx.lineWidth = 1;
      if (p && index.has(p)) {
        ctx.globalAlpha = alive ? 0.55 : 0.4;
        ctx.beginPath(); ctx.moveTo(x0, Y(index.get(p))); ctx.lineTo(x0, y); ctx.stroke();
      } else if (s.parent) {
        // Branched from an ancestor that is not shown: a short dotted stub up and to the left.
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0, y - rowH * 0.45); ctx.lineTo(Math.max(0, x0 - 6), y - rowH * 0.45); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = alive ? s.color : muted;
      ctx.globalAlpha = alive ? 1 : 0.7;
      ctx.lineWidth = alive ? Math.min(rowH - 1, 1.5 + Math.sqrt(s.count) * 0.7) : 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Math.max(x1, x0 + 1.5), y); ctx.stroke();
      if (s.born < t0) {
        // Began before the visible time span: a small arrow at the left edge.
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(left + 3, y - 3); ctx.lineTo(left + 3, y + 3); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // Names of living species (and the hovered one) at the end of their lines.
    ctx.font = `${clamp(rowH - 1, 8, 11)}px ${ui.col.mono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    rows.forEach((s, i) => {
      const alive = s.count > 0;
      if (!(alive && rowH >= 8) && s !== this.hover && s !== sim.focus) return;
      ctx.fillStyle = alive ? ui.col.ink : muted;
      ctx.fillText(alive ? `${s.name} ${s.count}` : `${s.name} †`, X(alive ? now : s.died) + 6, Y(i));
    });

    const s = this.hover || sim.focus;
    this.info.textContent = s
      ? ui.describeSpecies(s)
      : `${sp.alive} living species, ${n} shown; tiny extinct offshoots${levels < Infinity ? ' and older ancestors' : ''} are hidden. Hover a branch for details, click it to highlight its members.`;
  }
}
TreeView.minPeak = 3;
