'use strict';

/* ---------- UIController: DOM bindings, dashboard, brain inspector ---------- */
class UIController {
  constructor(sim, autosave) {
    this.sim = sim;
    this.autosave = autosave;
    this.$ = id => document.getElementById(id);
    this.lastStats = 0;
    this.lastBrain = 0;
    this.resumeSpeed = 1;
    this.groupColors = GROUP_COLOR_VARS.map(cssVar);
    this.col = {
      ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'),
      pos: cssVar('--accent'), neg: cssVar('--neg'), mono: cssVar('--mono'),
    };
    this.bindSpeed();
    this.bindSliders();
    this.bindMisc();
    this.spark = this.setupCanvas(this.$('spark'));
    this.diet = this.setupCanvas(this.$('diet'));
    this.brain = this.setupCanvas(this.$('brain'));
    this.stats = new Map(); // species id -> { n, diet, size } over its living members
    this.tree = new TreeView(this);
    this.progress = new ProgressView(this);
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
    this.sliders = [
      { id: 'plantRate', key: 'plantRate', fmt: v => `${v} /s`, apply: v => { sim.plantRate = v; } },
      { id: 'drain', key: 'drainMult', fmt: v => `${v.toFixed(2)}×`, apply: v => { sim.drainMult = v; } },
      { id: 'mutation', key: 'mutationRate', fmt: v => `${Math.round(v * 100)}% of weights`, apply: v => { sim.mutationRate = v; } },
      { id: 'sensor', key: 'sensorRange', fmt: v => `${v} px`, apply: v => sim.setSensorRange(v) },
    ];
    for (const s of this.sliders) {
      const input = this.$(s.id), out = this.$(s.id + '-out');
      input.addEventListener('input', () => { const v = Number(input.value); s.apply(v); out.textContent = s.fmt(v); });
    }
    // The simulation's settings are the truth (they may come from a resumed world), so show those.
    this.syncSliders();
  }

  // Show the simulation's current settings, e.g. after loading or resuming a world.
  syncSliders() {
    for (const s of this.sliders) {
      const v = this.sim[s.key];
      this.$(s.id).value = v;
      this.$(s.id + '-out').textContent = s.fmt(v);
    }
    this.sim.setSensorRange(this.sim.sensorRange);
  }

  bindMisc() {
    const sim = this.sim;
    this.$('reset').addEventListener('click', () => this.startWorld(Random.newSeed()));
    this.$('seed-form').addEventListener('submit', e => {
      e.preventDefault();
      const s = Number(this.$('seed').value.trim());
      if (Number.isInteger(s) && s > 0 && s < 4294967296) this.startWorld(s);
      else this.$('seed').value = sim.seed;
    });
    this.showSeed();

    this.colorButtons = [...document.querySelectorAll('[data-color]')];
    for (const b of this.colorButtons) b.addEventListener('click', () => this.setColorBy(b.dataset.color));
    this.$('tree-open').addEventListener('click', () => this.tree.toggle());
    this.$('progress-open').addEventListener('click', () => this.progress.toggle());
    this.$('in-focus').addEventListener('click', () => {
      const s = sim.selected && sim.selected.species;
      if (s) this.setFocus(sim.focus === s ? null : s);
    });

    this.$('save').addEventListener('click', () => this.saveWorld());
    this.$('load').addEventListener('click', () => this.$('load-file').click());
    this.$('load-file').addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.loadWorld(file);
    });

    const keep = this.$('keep-progress');
    keep.checked = this.autosave.enabled;
    keep.addEventListener('change', () => {
      this.autosave.enabled = keep.checked;
      this.setStatus(keep.checked
        ? 'Progress will be kept in this browser and resumed on your next visit.'
        : 'Progress is no longer kept; the saved world in this browser was removed.');
    });
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
      else if (e.key === 't' || e.key === 'T') this.tree.toggle();
      else if (e.key === 'p' || e.key === 'P') this.progress.toggle();
      else if (e.key === 'c' || e.key === 'C') this.setColorBy(sim.renderer.colorBy === 'species' ? 'diet' : 'species');
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

  setColorBy(mode) {
    this.sim.renderer.colorBy = mode;
    for (const b of this.colorButtons) b.setAttribute('aria-pressed', String(b.dataset.color === mode));
  }

  // Highlight one species' members on the map, in the species list and in the family tree.
  setFocus(s) {
    this.sim.focus = s;
    this.lastStats = 0;
    this.tree.draw();
  }

  // One line about a species, for the family tree and the inspector.
  describeSpecies(s) {
    const sp = this.sim.species, parent = sp.get(s.parent), st = this.stats.get(s.id);
    const diet = st ? st.diet / st.n : s.rep.genes.diet, size = st ? st.size / st.n : s.rep.genes.size;
    const origin = parent ? `branched from ${parent.name} at ${formatTicks(s.born)}` : `founded at ${formatTicks(s.born)}`;
    const state = s.count ? `${s.count} alive (peak ${s.peak})` : `extinct at ${formatTicks(s.died)}, peak ${s.peak}`;
    return `${s.name}: ${state}, ${s.total} ever. ${origin[0].toUpperCase()}${origin.slice(1)}. ` +
      `${DIET_GROUPS[diet < 1 / 3 ? 0 : diet < 2 / 3 ? 1 : 2].replace(/s$/, '')}, diet ${diet.toFixed(2)}, size ${size.toFixed(2)}.`;
  }

  startWorld(seed) {
    this.sim.reset(seed);
    this.lastStats = 0;
    this.showSeed();
    this.autosave.save();
    this.tree.draw();
    this.progress.toggle(this.progress.open);
  }

  saveWorld() {
    const sim = this.sim;
    const name = `tidepool-seed${sim.seed}-t${sim.ticks}.json`;
    const blob = new Blob([JSON.stringify(sim.serialize())], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.setStatus(`Saved ${name} (${sim.agents.length} creatures, ${Math.round(blob.size / 1024)} KB).`);
  }

  async loadWorld(file) {
    const sim = this.sim;
    try {
      const data = JSON.parse(await file.text());
      sim.load(data);
      this.autosave.save();
      this.syncSliders();
      this.showSeed();
      this.lastStats = 0;
      this.tree.draw();
      this.progress.toggle(this.progress.open);
      const sized = data.width === sim.W && data.height === sim.H;
      this.setStatus(`Loaded ${file.name}: ${sim.agents.length} creatures at gen ${sim.maxGen}.` +
        (sized ? '' : ` It was saved at ${data.width}×${data.height}, so creatures outside this window were moved inside and the run will not replay exactly.`));
    } catch (err) {
      this.setStatus(err instanceof SyntaxError ? `${file.name} is not valid JSON.` : err.message);
    }
  }

  setStatus(text) {
    this.$('world-status').textContent = text;
  }

  // Keep the seed visible and in the address, so the current world can be shared or replayed.
  showSeed() {
    const seed = this.sim.seed;
    this.$('seed').value = seed;
    try {
      const url = new URL(location.href);
      url.searchParams.set('seed', seed);
      history.replaceState(null, '', url);
    } catch (err) { /* some embedded viewers refuse URL changes; the seed field still shows it */ }
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
      this.drawDiet();
    }
    if (now - this.lastBrain > 80) { this.lastBrain = now; this.drawBrain(); }
    this.tree.frame(now);
    this.progress.frame(now);
  }

  updateStats() {
    const sim = this.sim, $ = this.$;
    if (this.autosave.lastError && !this.reportedSaveError) {
      this.reportedSaveError = true;
      this.setStatus("This world is too large for this browser's storage, so it is no longer kept automatically. Use Save world to keep it as a file.");
    }
    $('m-pop').textContent = sim.agents.length;
    $('m-species').textContent = sim.species.alive;
    $('mp').textContent = sim.plants.length;
    $('st-gen').textContent = sim.maxGen;
    $('st-tps').textContent = sim.speed === 0 ? '0' : sim.tps.toLocaleString();
    $('st-time').textContent = formatTicks(sim.ticks);
    $('reseed-note').innerHTML = `Each species' population over the last 150 s of sim time, related species side by side. A diet group below ${EVOLVE.groupFloor}, or a world below ${EVOLVE.minPop}, is topped up with mutated copies of the best genomes so far (<b>${sim.reseeds}</b> so far).`;
    this.updateSpecies();
  }

  // The largest living species, with their members' average diet.
  updateSpecies() {
    const sim = this.sim, $ = this.$, stats = this.stats;
    stats.clear();
    for (const a of sim.agents) {
      let st = stats.get(a.species.id);
      if (!st) stats.set(a.species.id, st = { n: 0, diet: 0, size: 0 });
      st.n++; st.diet += a.diet; st.size += a.genome.genes.size;
    }
    const living = sim.species.list.filter(s => s.count > 0).sort((m, n) => n.count - m.count);
    const top = living.slice(0, 6);
    if (sim.focus && !top.includes(sim.focus)) top.push(sim.focus);
    const ever = sim.species.nextId - 1;
    $('sp-summary').textContent = `${living.length} alive · ${ever.toLocaleString()} ever`;

    // Reuse the row buttons so a click is not lost to a rebuild between press and release.
    const box = $('species-rows');
    while (box.children.length < top.length + 1) {
      const b = document.createElement('button');
      b.className = 'pop-row sp-row';
      b.innerHTML = '<span class="sp"><i class="dot"></i><span></span></span><b></b><span></span><span></span>';
      b.addEventListener('click', () => {
        const s = sim.species.get(Number(b.dataset.id));
        if (s) this.setFocus(sim.focus === s ? null : s);
      });
      box.appendChild(b);
    }
    [...box.children].forEach((b, i) => {
      const s = top[i];
      if (!s) {
        b.hidden = i !== top.length || living.length <= top.length;
        b.disabled = true;
        b.querySelector('.sp > span').textContent = `+${living.length - top.length} smaller species`;
        b.querySelector('.dot').style.display = 'none';
        for (const el of [...b.children].slice(1)) el.textContent = '';
        b.removeAttribute('aria-pressed');
        return;
      }
      const st = stats.get(s.id), cells = b.children;
      b.hidden = false;
      b.disabled = false;
      b.dataset.id = s.id;
      b.style.setProperty('--c', s.color);
      b.querySelector('.dot').style.display = '';
      b.querySelector('.sp > span').textContent = s.name;
      cells[1].textContent = s.count;
      cells[2].textContent = st ? (st.diet / st.n).toFixed(2) : '–';
      cells[3].textContent = formatTicks(s.born);
      b.setAttribute('aria-pressed', String(sim.focus === s));
    });
  }

  // Histogram of the diet gene across the living population, plus each diet group's average body.
  drawDiet() {
    const c = this.diet, sim = this.sim;
    const bins = new Array(24).fill(0);
    const cols = ['size', 'eye', 'fin', 'jaw', 'spike', 'armour'];
    const sums = DIET_GROUPS.map(() => Object.fromEntries(cols.map(k => [k, 0])));
    for (const a of sim.agents) {
      bins[Math.min(bins.length - 1, Math.floor(a.diet * bins.length))]++;
      const s = sums[a.kind];
      s.size += a.genome.genes.size;
      for (const p of a.genome.parts) if (p.type in s) s[p.type]++;
    }
    // Numbers only go into this markup, so building it as a string is safe.
    let html = '<span class="head">avg</span>' + ['size', 'eyes', 'fins', 'jaws', 'spikes', 'armour'].map(h => `<span class="head">${h}</span>`).join('');
    DIET_GROUPS.forEach((name, k) => {
      const n = sim.counts[k];
      html += `<span>${['Plants', 'Mixed', 'Meat'][k]}</span>` + cols.map(col => `<span>${n ? (sums[k][col] / n).toFixed(col === 'size' ? 2 : 1) : '–'}</span>`).join('');
    });
    this.$('body-avg').innerHTML = html;
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

  // Stacked populations of every species over time, in family-tree order so relatives sit together.
  drawSpark() {
    if (!this.fitCanvas(this.spark)) return;
    const { ctx, w, h } = this.spark, sim = this.sim, hist = sim.speciesHistory, n = SPECIES.historyLength;
    ctx.clearRect(0, 0, w, h);
    const top = 10, bottom = h - 2, len = hist.length;
    const order = sim.species.order(), slot = new Map(order.map((s, i) => [s.id, i]));
    const K = order.length + 1; // the last slot collects species already dropped from the tree
    const dense = hist.map(sample => {
      const row = new Float32Array(K);
      for (let i = 0; i < sample.length; i += 2) {
        const k = slot.has(sample[i]) ? slot.get(sample[i]) : K - 1;
        row[k] += sample[i + 1];
      }
      return row;
    });
    let max = 10;
    for (const row of dense) { let t = 0; for (const v of row) t += v; if (t > max) max = t; }
    ctx.strokeStyle = this.col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bottom + 0.5); ctx.lineTo(w, bottom + 0.5); ctx.stroke();
    ctx.fillStyle = this.col.muted;
    ctx.font = `10px ${this.col.mono}`;
    ctx.textBaseline = 'top';
    ctx.fillText(`peak ${max}`, 0, 0);
    if (len < 2) return;
    const dx = w / (n - 1), x0 = w - (len - 1) * dx, scale = (bottom - top) / max;
    const base = new Float32Array(len);
    for (let k = 0; k < K; k++) {
      let any = false;
      for (let j = 0; j < len; j++) if (dense[j][k]) { any = true; break; }
      if (!any) continue;
      const s = order[k];
      ctx.fillStyle = s ? s.color : this.col.muted;
      ctx.globalAlpha = !sim.focus || sim.focus === s ? 0.85 : 0.3;
      ctx.beginPath();
      for (let j = 0; j < len; j++) ctx.lineTo(x0 + j * dx, bottom - (base[j] + dense[j][k]) * scale);
      for (let j = len - 1; j >= 0; j--) ctx.lineTo(x0 + j * dx, bottom - base[j] * scale);
      ctx.fill();
      for (let j = 0; j < len; j++) base[j] += dense[j][k];
    }
    ctx.globalAlpha = 1;
  }

  drawBrain() {
    const a = this.sim.selected, $ = this.$;
    if (!this.fitCanvas(this.brain)) return;
    const { ctx, w, h } = this.brain;
    ctx.clearRect(0, 0, w, h);
    if (!a) return;
    const s = a.species, parent = this.sim.species.get(s.parent);
    $('in-dot').style.setProperty('--c', s.color);
    $('in-ebar').style.setProperty('--c', s.color);
    $('in-name').textContent = s.name;
    $('in-species').textContent = `${a.traits.name.replace(/s$/, '')} · species of ${s.count}` +
      (parent ? `, branched from ${parent.name} at ${formatTicks(s.born)}` : `, founded at ${formatTicks(s.born)}`);
    $('in-focus').setAttribute('aria-pressed', String(this.sim.focus === s));
    $('in-focus').textContent = this.sim.focus === s ? 'Stop highlighting' : 'Highlight species';
    $('in-meta').textContent = `#${a.id} · gen ${a.gen}`;
    $('in-energy').style.width = `${Math.max(0, Math.min(1, a.energy / a.traits.maxEnergy)) * 100}%`;
    const t = a.traits;
    $('gn-size').textContent = a.genome.genes.size.toFixed(2);
    $('gn-diet').textContent = a.diet.toFixed(2);
    $('gn-mass').textContent = t.mass.toFixed(2);
    $('gn-speed').textContent = t.maxSpeed.toFixed(2);
    $('gn-defence').textContent = `${Math.round(t.defence * 100)}%`;
    const parts = PART_TYPES.map(type => {
      const n = a.genome.count(type);
      return n ? `${n} ${type}${n > 1 && type !== 'armour' && type !== 'fat' ? 's' : ''}` : null;
    }).filter(Boolean);
    $('in-parts').textContent = 'Parts: ' + (parts.length ? parts.join(' · ') : 'none') +
      (t.jawRatio ? ` · eats prey up to ${t.jawRatio.toFixed(2)}× its size` : ' · cannot hunt');
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
