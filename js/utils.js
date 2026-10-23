'use strict';

/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const TICKS_PER_SEC = 60;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Diet 0 → 1 runs green (plants) → violet (mixed) → red (meat), matching the classic species colours.
function dietColor(d) {
  const h = d < 0.5 ? 145 + 117 * (d / 0.5) : 262 + 90 * ((d - 0.5) / 0.5);
  return `hsl(${h.toFixed(0)}, 100%, 67%)`;
}
