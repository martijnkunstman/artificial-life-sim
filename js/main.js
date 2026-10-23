'use strict';

/* ---------- boot ---------- */
// ?seed=123 in the address opens that world. Otherwise the world kept in this browser is resumed,
// or a fresh one starts.
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
const requestedSeed = Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : null;
const sim = new Simulation({
  width: Math.max(320, window.innerWidth),
  height: Math.max(320, window.innerHeight),
  seed: requestedSeed || Random.newSeed(),
  particles: new ParticleSystem(2400),
  plantColor: cssVar('--plant'),
});
const autosave = new AutoSave(sim);
const restored = autosave.restore(requestedSeed);
sim.renderer = new Renderer(document.getElementById('world'), document.getElementById('overlay'), sim);
sim.ui = new UIController(sim, autosave);
if (restored.resumed) {
  const minutes = Math.round((Date.now() - restored.savedAt) / 60000);
  sim.ui.setStatus(`Resumed your world (seed ${sim.seed}, gen ${sim.maxGen}), saved ${minutes < 1 ? 'less than a minute' : minutes === 1 ? '1 minute' : `${minutes} minutes`} ago.`);
} else if (restored.reason) {
  sim.ui.setStatus(restored.reason);
}
autosave.start();
window.addEventListener('resize', () => {
  const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight);
  sim.resize(w, h);
  sim.renderer.resize(w, h);
});
sim.start();
