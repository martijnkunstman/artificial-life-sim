'use strict';

/* ---------- ProgressView: is evolution producing better creatures? Charts of the exam scores ---------- */
// Three charts over the whole run: the foraging exam, the hunting exam (both against the untrained
// baseline, dashed) and self-sufficiency in the living world. Each has a one-line verdict underneath.
class ProgressView {
  constructor(ui) {
    this.ui = ui;
    this.sim = ui.sim;
    const $ = ui.$;
    this.panel = $('progress-panel');
    this.charts = {
      forage: ui.setupCanvas($('pg-forage')),
      hunt: ui.setupCanvas($('pg-hunt')),
      self: ui.setupCanvas($('pg-self')),
    };
    this.lastDraw = 0;
    this.drawnSamples = -1;
    $('progress-close').addEventListener('click', () => this.toggle(false));
  }

  get open() { return !this.panel.hidden; }

  toggle(open = !this.open) {
    this.panel.hidden = !open;
    this.ui.$('progress-open').setAttribute('aria-expanded', String(open));
    if (open) { this.drawnSamples = -1; this.draw(); }
  }

  frame(now) {
    if (this.open && now - this.lastDraw > 500) this.draw();
  }

  draw() {
    this.lastDraw = performance.now();
    if (!this.open) return;
    const sim = this.sim, pg = sim.progress, ui = this.ui, $ = ui.$;
    const next = pg.round ? 'Exams under way…' : `Next exams in ${formatTicks(pg.every - sim.ticks % pg.every)} of sim time.`;
    $('pg-status').textContent = `${pg.samples.length} rounds of exams so far, one every ${formatTicks(pg.every)} of sim time. ${next}`;
    // The charts only change when a round finishes (or the panel is resized).
    const size = this.charts.forage.el.clientWidth;
    if (pg.samples.length === this.drawnSamples && size === this.drawnSize) return;
    this.drawnSamples = pg.samples.length;
    this.drawnSize = size;

    const col = ui.groupColors, t1 = pg.samples.length ? pg.samples[pg.samples.length - 1].t : 0;
    const base = pg.baseline || { forage: [null, null], hunt: [null, null] };
    const exam = (key, unit) => Progress.groupsFor(key).map((k, slot) => ({
      name: DIET_GROUPS[k], color: col[k], points: pg.series(key, slot), baseline: base[key][slot], unit,
    }));
    const forage = exam('forage', 'plants/min'), hunt = exam('hunt', 'catches/min');
    const self = [0, 1, 2].map(k => ({ name: DIET_GROUPS[k], color: col[k], points: pg.series('self', k), baseline: null }));

    this.chart(this.charts.forage, forage, t1, v => v.toFixed(0));
    this.chart(this.charts.hunt, hunt, t1, v => v.toFixed(1));
    this.chart(this.charts.self, self, t1, v => `${Math.round(v * 100)}%`, 1);
    $('pg-forage-v').textContent = this.verdict(forage, 'plants/min');
    $('pg-hunt-v').textContent = this.verdict(hunt, 'catches/min');
    $('pg-self-v').textContent = pg.samples.length
      ? 'Share of new creatures that were born rather than topped up, recently: ' + self.map(s => {
        const tr = Progress.trend(s.points);
        return `${s.name.toLowerCase()} ${tr ? Math.round(tr.now * 100) + '%' : '–'}`;
      }).join(', ') + '. 100% means the group sustains itself.'
      : '';
  }

  // Raw exam scores as faint dots, a smoothed line through them, the untrained baseline dashed.
  chart(c, series, t1, fmt, fixedMax = 0) {
    if (!this.ui.fitCanvas(c)) return;
    const { ctx, w, h } = c, ui = this.ui;
    ctx.clearRect(0, 0, w, h);
    const left = 2, right = w - 2, top = 12, bottom = h - 2;
    let max = fixedMax || 1;
    if (!fixedMax) {
      for (const s of series) {
        for (const p of s.points) max = Math.max(max, p.v);
        if (s.baseline !== null) max = Math.max(max, s.baseline);
      }
      max *= 1.1;
    }
    const X = t => left + (right - left) * (t1 ? t / t1 : 0);
    const Y = v => bottom - (v / max) * (bottom - top);
    ctx.strokeStyle = ui.col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bottom + 0.5); ctx.lineTo(w, bottom + 0.5); ctx.stroke();
    ctx.fillStyle = ui.col.muted;
    ctx.font = `10px ${ui.col.mono}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(fmt(fixedMax || max), 0, 0);
    ctx.textAlign = 'right';
    ctx.fillText(formatTicks(t1), w, 0);

    for (const s of series) {
      if (s.baseline !== null) {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(left, Y(s.baseline)); ctx.lineTo(right, Y(s.baseline)); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.35;
      for (const p of s.points) { ctx.beginPath(); ctx.arc(X(p.t), Y(p.v), 1.6, 0, TAU); ctx.fill(); }
      const smooth = ProgressView.smooth(s.points);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      smooth.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Trailing average over the last few rounds; single exams are noisy (a few creatures, a few catches).
  static smooth(points, n = 5) {
    let sum = 0;
    return points.map((p, i) => {
      sum += p.v;
      if (i >= n) sum -= points[i - n].v;
      return { t: p.t, v: sum / Math.min(i + 1, n) };
    });
  }

  // For each group: its recent score, how it compares with untrained founders, and where it is heading.
  verdict(series, unit) {
    const pg = this.sim.progress;
    const parts = series.map(s => {
      const tr = Progress.trend(s.points);
      if (!tr) return `${s.name}: no members to examine yet.`;
      let text = `${s.name}: ${tr.now.toFixed(1)} ${unit}`;
      if (s.baseline) text += `, ${(tr.now / s.baseline).toFixed(1)}× untrained (${s.baseline.toFixed(1)})`;
      else if (s.baseline === 0 && tr.now > 0) text += ', untrained founders score 0';
      if (tr.before === null) return `${text}; too early to see a trend.`;
      const change = tr.before > 0 ? (tr.now - tr.before) / tr.before : tr.now > 0 ? 1 : 0;
      const span = formatTicks(Math.min(8, Math.floor(s.points.length / 2)) * pg.every);
      const dir = change > 0.1 ? 'rising' : change < -0.1 ? 'falling' : 'holding steady';
      return `${text}; ${dir} (${change >= 0 ? '+' : ''}${Math.round(change * 100)}% over the last ${span}).`;
    });
    return parts.join(' ');
  }
}
