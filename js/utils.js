'use strict';

/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const TICKS_PER_SEC = 60;
const rand = (a = 0, b = 1) => a + rng.next() * (b - a);
const chance = p => rng.next() < p;
const pick = arr => arr[(rng.next() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = rng.next();
  while (v === 0) v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
// The world wraps around: leaving one side enters the opposite one.
// wrap() brings a coordinate back into [0, size); wrapDelta() is the shortest signed difference
// between two coordinates, which may run across the seam.
const wrap = (v, size) => v - size * Math.floor(v / size);
const wrapDelta = (d, size) => d - size * Math.round(d / size);
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
// Sim time as m:ss, or h:mm:ss past an hour.
function formatTicks(ticks) {
  const t = Math.floor(ticks / TICKS_PER_SEC);
  const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Diet 0 → 1 runs green (plants) → violet (mixed) → red (meat), matching the diet group colours.
function dietColor(d) {
  const h = d < 0.5 ? 145 + 117 * (d / 0.5) : 262 + 90 * ((d - 0.5) / 0.5);
  return `hsl(${h.toFixed(0)}, 100%, 67%)`;
}
