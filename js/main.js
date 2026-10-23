'use strict';

/* ---------- boot ---------- */
// ?seed=123 in the address replays that world; without it every load starts a fresh one.
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
const sim = new Simulation({
  width: Math.max(320, window.innerWidth),
  height: Math.max(320, window.innerHeight),
  seed: Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : Random.newSeed(),
  particles: new ParticleSystem(2400),
  plantColor: cssVar('--plant'),
});
sim.renderer = new Renderer(document.getElementById('world'), document.getElementById('overlay'), sim);
sim.ui = new UIController(sim);
window.addEventListener('resize', () => {
  const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight);
  sim.resize(w, h);
  sim.renderer.resize(w, h);
});
sim.start();
