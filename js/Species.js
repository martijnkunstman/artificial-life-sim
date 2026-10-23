'use strict';

/* ---------- Species: lineages split by genetic distance, kept as a family tree ---------- */
// Every species remembers the body it was founded with (its representative). A newborn joins its
// parent's species while its body stays within SPECIES.threshold of that representative; the first
// newborn beyond it founds a new species that branches off its parent's. Nothing here draws from the
// seeded generator, so tracking species never changes how a world plays out.
const NAME_START = ['ka', 'lo', 'mi', 'ra', 've', 'nu', 'tho', 'si', 'qua', 'ze', 'or', 'el', 'pa', 'dri', 'sa', 'fen', 'ul', 'bri', 'cor', 'ny'];
const NAME_MID = ['la', 'ri', 'no', 'va', 'mu', 'te', 'shi', 'do', 'ka', 'phi', 'ro', 'ze', 'li', 'su', 'na', 'go'];
const NAME_END = ['x', 'n', 'ra', 'us', 'is', 'on', 'el', 'a', 'or', 'yx', 'ith', 'ae', 'um', 'es', 'ix', 'ar'];

// Small integer hash (for names and colours, which must not touch the seeded generator).
function hash32(n) {
  let h = Math.imul((n >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

function speciesName(id) {
  const h = hash32(id);
  const mid = (h >>> 12) % 3 === 0 ? '' : NAME_MID[(h >>> 4) % NAME_MID.length];
  const s = NAME_START[h % NAME_START.length] + mid + NAME_END[(h >>> 8) % NAME_END.length];
  return s[0].toUpperCase() + s.slice(1);
}

// Hue in degrees for a diet, matching dietColor().
function dietHue(d) {
  return d < 0.5 ? 145 + 117 * (d / 0.5) : 262 + 90 * ((d - 0.5) / 0.5);
}

class SpeciesRegistry {
  constructor() {
    this.clear();
  }

  clear() {
    this.list = [];
    this.byId = new Map();
    this.nextId = 1;
    this.alive = 0;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  // Roots take their colour from their diet; a branch shifts its parent's hue a little either way,
  // so related species look alike.
  add(s) {
    s.color = `hsl(${s.hue.toFixed(0)}, 100%, 67%)`;
    s.name = speciesName(s.id);
    this.list.push(s);
    this.byId.set(s.id, s);
    return s;
  }

  found(genome, parent, tick) {
    const id = this.nextId++, h = hash32(id * 7 + 3);
    const shift = (18 + (h % 30)) * (h & 0x100 ? 1 : -1);
    const hue = parent ? (parent.hue + shift + 360) % 360 : dietHue(genome.genes.diet);
    return this.add({
      id, parent: parent ? parent.id : 0, rep: genome.clone(), hue,
      born: tick, died: -1, count: 0, peak: 0, total: 0,
    });
  }

  // The species a newborn with this genome belongs to, given its parent's species (null for none).
  // A top-up copied from an extinct species founds a new branch rather than reviving the old one.
  assign(genome, from, tick) {
    if (from && from.count > 0 && Genome.distance(genome, from.rep) <= SPECIES.threshold) return from;
    return this.found(genome, from, tick);
  }

  join(s) {
    if (s.count++ === 0) { this.alive++; s.died = -1; }
    s.total++;
    if (s.count > s.peak) s.peak = s.count;
  }

  leave(s, tick) {
    if (--s.count === 0) { this.alive--; s.died = tick; }
  }

  // Drop dead ends: extinct species with no species left branching off them, once they have been
  // extinct for a while (or sooner when the tree grows too large). Ancestors of anything kept stay.
  prune(tick) {
    const kids = new Map();
    for (const s of this.list) if (s.parent) kids.set(s.parent, (kids.get(s.parent) || 0) + 1);
    const deadEnd = s => s.count === 0 && !kids.get(s.id);
    let drop = new Set(this.list.filter(s => deadEnd(s) && tick - s.died > SPECIES.keepExtinct));
    const over = this.list.length - drop.size - SPECIES.maxKept;
    if (over > 0) {
      const oldest = this.list.filter(s => deadEnd(s) && !drop.has(s)).sort((m, n) => m.died - n.died);
      for (const s of oldest.slice(0, over)) drop.add(s);
    }
    if (!drop.size) return;
    this.list = this.list.filter(s => !drop.has(s));
    for (const s of drop) this.byId.delete(s.id);
  }

  // Depth-first order of the tree: each species, then the species branching off it, newest branch
  // first. Drawn as rows, that order lets every branch line drop down without crossing another.
  // keep(s) decides which species to include; ancestors of included species are always included.
  order(keep = () => true) {
    const shown = new Set();
    for (const s of this.list) {
      if (!keep(s)) continue;
      for (let t = s; t && !shown.has(t); t = this.get(t.parent)) shown.add(t);
    }
    const kids = new Map(), roots = [];
    for (const s of this.list) {
      if (!shown.has(s)) continue;
      const p = this.get(s.parent);
      if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(s); } else roots.push(s);
    }
    const out = [];
    const visit = s => {
      out.push(s);
      const k = kids.get(s);
      if (k) for (const c of k.sort((m, n) => n.born - m.born)) visit(c);
    };
    for (const r of roots.sort((m, n) => m.born - n.born)) visit(r);
    return out;
  }

  toJSON() {
    return {
      nextId: this.nextId,
      list: this.list.map(s => ({
        id: s.id, parent: s.parent, rep: s.rep, hue: s.hue,
        born: s.born, died: s.died, count: s.count, peak: s.peak, total: s.total,
      })),
    };
  }

  load(d) {
    this.clear();
    this.nextId = d.nextId;
    for (const s of d.list) this.add({ ...s, rep: Genome.fromJSON(s.rep) });
    this.alive = this.list.filter(s => s.count > 0).length;
  }
}
