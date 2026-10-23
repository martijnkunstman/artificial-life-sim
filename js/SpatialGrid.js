'use strict';

/* ---------- SpatialGrid: linked-list buckets in typed arrays, rebuilt each tick in O(n) ---------- */
class SpatialGrid {
  constructor() {
    this.cell = 100; this.cols = 1; this.rows = 1;
    this.head = new Int32Array(1);
    this.next = new Int32Array(256);
    this.items = [];
  }
  resize(w, h, cell) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.head = new Int32Array(this.cols * this.rows);
  }
  cellOf(x, y) {
    const cx = clamp(Math.floor(x / this.cell), 0, this.cols - 1);
    const cy = clamp(Math.floor(y / this.cell), 0, this.rows - 1);
    return cy * this.cols + cx;
  }
  build(items) {
    this.items = items;
    this.head.fill(-1);
    if (this.next.length < items.length) this.next = new Int32Array(items.length * 2);
    for (let i = 0; i < items.length; i++) {
      const c = this.cellOf(items[i].pos.x, items[i].pos.y);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
}
