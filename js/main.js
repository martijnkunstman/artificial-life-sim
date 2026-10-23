'use strict';

/* ---------- boot ---------- */
const sim = new Simulation();
sim.renderer = new Renderer(document.getElementById('world'), document.getElementById('overlay'), sim);
sim.ui = new UIController(sim);
window.addEventListener('resize', () => {
  const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight);
  sim.resize(w, h);
  sim.renderer.resize(w, h);
});
sim.start();
