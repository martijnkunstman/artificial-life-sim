'use strict';

/* ---------- UIController: DOM bindings, dashboard, brain inspector ---------- */
class UIController {
  constructor(sim) {
    this.sim = sim;
    this.$ = id => document.getElementById(id);
    this.lastStats = 0;
    this.lastBrain = 0;
    this.resumeSpeed = 1;
    this.col = {
      ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'),
      pos: cssVar('--accent'), neg: cssVar('--neg'), mono: cssVar('--mono'),
    };
    this.bindSpeed();
    this.bindMode();
    this.bindSliders();
    this.bindMisc();
    this.spark = this.setupCanvas(this.$('spark'));
    this.diet = this.setupCanvas(this.$('diet'));
    this.brain = this.setupCanvas(this.$('brain'));
    this.applyMode();
  }

  setupCanvas(el) {
    const c = { el, ctx: el.getContext('2d'), w: 0, h: 0 };
    this.fitCanvas(c);
    return c;
  }

  // Charts can start inside a collapsed or hidden panel, so match the backing store to the CSS size when drawn.
  fitCanvas(c) {
    const w = c.el.clientWidth, h = c.el.clientHeight;
    if (!w || !h || (w === c.w && h === c.h)) return w > 0 && h > 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.el.width = Math.round(w * dpr); c.el.height = Math.round(h * dpr);
    c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.w = w; c.h = h;
    return true;
  }

  bindMode() {
    this.modeButtons = [...document.querySelectorAll('[data-mode]')];
    for (const b of this.modeButtons) {
      b.addEventListener('click', () => {
        if (b.dataset.mode === this.sim.mode) return;
        this.sim.setMode(b.dataset.mode);
        this.applyMode();
      });
    }
  }

  applyMode() {
    const sim = this.sim, $ = this.$, evolving = sim.evolving;
    for (const b of this.modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === sim.mode));
    const names = evolving ? DIET_GROUPS : SPECIES.map(s => s.name);
    names.forEach((n, k) => { $('n' + k).textContent = n; });
    $('pop-head').textContent = evolving ? 'Diet group' : 'Species';
    $('diet-wrap').hidden = !evolving;
    $('in-genes').hidden = !evolving;
    $('mode-note').textContent = evolving
      ? 'Every creature inherits body genes: size, speed, agility, sight and diet. Groups emerge from the diet gene; nothing is assigned. Switching resets the world.'
      : 'Three fixed species with a hardcoded food chain. Only the brains evolve. Switching resets the world.';
    this.lastStats = 0;
  }

  bindSpeed() {
    this.speedButtons = [...document.querySelectorAll('[data-speed]')];
    for (const b of this.speedButtons) {
      b.addEventListener('click', () => {
        const v = b.dataset.speed === 'max' ? 'max' : Number(b.dataset.speed);
        this.setSpeed(v);
      });
    }
  }

  setSpeed(v) {
    this.sim.speed = v;
    if (v !== 0) this.resumeSpeed = v;
    for (const b of this.speedButtons) b.setAttribute('aria-pressed', String(b.dataset.speed === String(v)));
  }

  bindSliders() {
    const sim = this.sim;
    const specs = [
      { id: 'plantRate', fmt: v => `${v} /s`, apply: v => { sim.plantRate = v; } },
      { id: 'drain', fmt: v => `${v.toFixed(2)}×`, apply: v => { sim.drainMult = v; } },
      { id: 'mutation', fmt: v => `${Math.round(v * 100)}% of weights`, apply: v => { sim.mutationRate = v; } },
      { id: 'sensor', fmt: v => `${v} px`, apply: v => sim.setSensorRange(v) },
    ];
    for (const s of specs) {
      const input = this.$(s.id), out = this.$(s.id + '-out');
      const update = () => { const v = Number(input.value); s.apply(v); out.textContent = s.fmt(v); };
      input.addEventListener('input', update);
      update();
    }
  }

  bindMisc() {
    const sim = this.sim;
    this.$('reset').addEventListener('click', () => { sim.reset(); this.lastStats = 0; });
    const panel = this.$('panel'), btn = this.$('collapse');
    const setCollapsed = c => {
      panel.classList.toggle('collapsed', c);
      btn.setAttribute('aria-expanded', String(!c));
      btn.textContent = c ? '+' : '–';
      btn.title = c ? 'Expand panel' : 'Collapse panel';
    };
    btn.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
    if (window.innerWidth <= 720) setCollapsed(true);

    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const map = { '1': 0, '2': 1, '3': 2, '4': 5, '5': 'max' };
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(sim.speed === 0 ? this.resumeSpeed : 0); }
      else if (e.key in map) this.setSpeed(map[e.key]);
    });

    sim.renderer.canvas.addEventListener('click', e => {
      let best = null, bd = 28 * 28;
      for (const a of sim.agents) {
        const dx = a.pos.x - e.clientX, dy = a.pos.y - e.clientY, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = a; }
      }
      if (best) { sim.selected = best; sim.pinned = true; }
    });
  }

  pickFollow() {
    const sim = this.sim;
    if (sim.selected && !sim.selected.dead) return;
    sim.pinned = false;
    let best = null;
    for (const a of sim.agents) if (!best || a.gen > best.gen || (a.gen === best.gen && a.age > best.age)) best = a;
    sim.selected = best;
  }

  frame(now) {
    this.pickFollow();
    if (now - this.lastStats > 200) {
      this.lastStats = now;
      this.updateStats();
      this.drawSpark();
      if (this.sim.evolving) this.drawDiet();
    }
    if (now - this.lastBrain > 80) { this.lastBrain = now; this.drawBrain(); }
  }

  updateStats() {
    const sim = this.sim, $ = this.$;
    const gens = [0, 0, 0];
    for (const a of sim.agents) if (a.gen > gens[a.kind]) gens[a.kind] = a.gen;
    for (let k = 0; k < 3; k++) {
      $('c' + k).textContent = sim.counts[k];
      $('m' + k).textContent = sim.counts[k];
      $('g' + k).textContent = gens[k];
      $('b' + k).textContent = sim.births[k].toLocaleString();
    }
    $('cp').textContent = sim.plants.length;
    $('mp').textContent = sim.plants.length;
    $('bp').textContent = sim.plantsSpawned.toLocaleString();
    $('st-gen').textContent = sim.maxGen;
    $('reseed-note').innerHTML = sim.evolving
      ? `Population over the last 150 s of sim time. Gen is the deepest living lineage. If fewer than ${EVOLVE.minPop} creatures remain, the world is topped up with mutated copies of the best genomes so far (<b>${sim.reseeds}</b> so far).`
      : `Population over the last 150 s of sim time. Gen is the deepest living lineage. A species that drops below its floor is reseeded from mutated copies of its best past brains (<b>${sim.reseeds}</b> so far).`;
    $('st-tps').textContent = sim.speed === 0 ? '0' : sim.tps.toLocaleString();
    const t = Math.floor(sim.ticks / TICKS_PER_SEC);
    const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
    $('st-time').textContent = (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
  }

  // Histogram of the diet gene across the living population, plus the average body.
  drawDiet() {
    const c = this.diet, sim = this.sim;
    const bins = new Array(24).fill(0), sum = { size: 0, speed: 0, turn: 0, sense: 0 };
    for (const a of sim.agents) {
      if (!a.genome) continue;
      bins[Math.min(bins.length - 1, Math.floor(a.diet * bins.length))]++;
      for (const k in sum) sum[k] += a.genome.genes[k];
    }
    const n = sim.agents.length;
    this.$('body-avg').textContent = n
      ? 'Average body: ' + Object.keys(sum).map(k => `${GENE_LABELS[k].toLowerCase()} ${(sum[k] / n).toFixed(2)}`).join(' · ')
      : '';
    if (!this.fitCanvas(c)) return;
    const { ctx, w, h } = c;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(5, ...bins), bw = w / bins.length;
    ctx.strokeStyle = this.col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();
    for (let i = 0; i < bins.length; i++) {
      if (!bins[i]) continue;
      const bh = Math.max(2, (bins[i] / max) * (h - 12));
      ctx.fillStyle = dietColor((i + 0.5) / bins.length);
      ctx.fillRect(i * bw + 1, h - 1 - bh, bw - 2, bh);
    }
    ctx.fillStyle = this.col.muted;
    ctx.font = `10px ${this.col.mono}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`peak ${max}`, 0, 0);
  }

  drawSpark() {
    if (!this.fitCanvas(this.spark)) return;
    const { ctx, w, h } = this.spark, sim = this.sim, hist = sim.history;
    ctx.clearRect(0, 0, w, h);
    const top = 10, bottom = h - 2, n = 300;
    let max = 10;
    for (let k = 0; k < 3; k++) for (const v of hist[k]) if (v > max) max = v;
    ctx.strokeStyle = this.col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bottom + 0.5); ctx.lineTo(w, bottom + 0.5); ctx.stroke();
    ctx.fillStyle = this.col.muted;
    ctx.font = `10px ${this.col.mono}`;
    ctx.textBaseline = 'top';
    ctx.fillText(`peak ${max}`, 0, 0);
    const len = hist[0].length;
    if (len < 2) return;
    const x0 = w - (len - 1) * (w / (n - 1));
    for (let k = 0; k < 3; k++) {
      const s = hist[k];
      ctx.strokeStyle = sim.colors[k];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = x0 + i * (w / (n - 1)), y = bottom - (s[i] / max) * (bottom - top);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      const ly = bottom - (s[len - 1] / max) * (bottom - top);
      ctx.fillStyle = sim.colors[k];
      ctx.beginPath(); ctx.arc(w - 2, ly, 2.2, 0, TAU); ctx.fill();
    }
  }

  drawBrain() {
    const a = this.sim.selected, $ = this.$;
    if (!this.fitCanvas(this.brain)) return;
    const { ctx, w, h } = this.brain;
    ctx.clearRect(0, 0, w, h);
    if (!a) return;
    $('in-dot').style.setProperty('--c', a.color);
    $('in-ebar').style.setProperty('--c', a.color);
    $('in-name').textContent = a.traits.name;
    $('in-meta').textContent = `#${a.id} · gen ${a.gen}`;
    $('in-energy').style.width = `${Math.max(0, Math.min(1, a.energy / a.traits.maxEnergy)) * 100}%`;
    if (a.genome) {
      for (const k in GENE_LABELS) $('gn-' + k).textContent = a.genome.genes[k].toFixed(2);
    }
    $('in-age').textContent = `${Math.floor(a.age / TICKS_PER_SEC)} s`;
    $('in-meals').textContent = a.meals;
    $('in-kids').textContent = a.children;
    $('in-foot').textContent = this.sim.pinned
      ? 'Inspecting your pick. When it dies, the view follows the deepest lineage.'
      : 'Following the deepest lineage. Click any creature to inspect it.';

    const nn = a.brain, sizes = nn.sizes, L = nn.layers, last = sizes.length - 1;
    const xs = sizes.map((_, l) => 74 + l * ((w - 74 - 72) / last));
    const ys = (l, i) => sizes[l] === 1 ? h / 2 : 10 + i * ((h - 20) / (sizes[l] - 1));
    const act = (l, i) => (l === last ? L[l][i] * 2 - 1 : L[l][i]);

    ctx.lineWidth = 1;
    for (let l = 1; l <= last; l++) {
      const m = sizes[l - 1], wts = nn.weights[l - 1];
      for (let j = 0; j < sizes[l]; j++) {
        for (let i = 0; i < m; i++) {
          const wv = wts[j * m + i];
          const alpha = Math.min(1, Math.abs(wv) / 3) * (0.06 + 0.55 * Math.abs(act(l - 1, i)));
          if (alpha < 0.02) continue;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = wv > 0 ? this.col.pos : this.col.neg;
          ctx.beginPath(); ctx.moveTo(xs[l - 1], ys(l - 1, i)); ctx.lineTo(xs[l], ys(l, j)); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    for (let l = 0; l <= last; l++) {
      for (let i = 0; i < sizes[l]; i++) {
        const v = act(l, i), x = xs[l], y = ys(l, i);
        ctx.fillStyle = v >= 0 ? this.col.pos : this.col.neg;
        ctx.globalAlpha = 0.15 + 0.85 * Math.min(1, Math.abs(v));
        ctx.beginPath(); ctx.arc(x, y, l === 1 ? 3.6 : 4.2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.col.line;
        ctx.stroke();
      }
    }
    ctx.font = `9.5px ${this.col.mono}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.col.muted;
    ctx.textAlign = 'right';
    for (let i = 0; i < sizes[0]; i++) ctx.fillText(INPUT_LABELS[i], xs[0] - 8, ys(0, i));
    ctx.textAlign = 'left';
    for (let i = 0; i < sizes[last]; i++) {
      ctx.fillStyle = this.col.ink;
      ctx.fillText(`${OUTPUT_LABELS[i]} ${L[last][i].toFixed(2)}`, xs[last] + 8, ys(last, i));
    }
  }
}
