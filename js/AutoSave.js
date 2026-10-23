'use strict';

/* ---------- AutoSave: keeps the current world in this browser's localStorage and resumes it next visit ---------- */
class AutoSave {
  constructor(sim, { interval = 30000 } = {}) {
    this.sim = sim;
    this.interval = interval;
    this.lastSaved = 0;
    this.lastError = null;
  }

  // Storage can be missing or refuse access (private windows, blocked site data), so every access is guarded.
  static read(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }

  static write(key, value) {
    localStorage.setItem(key, value);
  }

  static remove(key) {
    try { localStorage.removeItem(key); } catch (err) { /* nothing to remove */ }
  }

  get enabled() {
    return AutoSave.read(AUTOSAVE_PREF_KEY) !== 'off';
  }

  set enabled(on) {
    try { localStorage.setItem(AUTOSAVE_PREF_KEY, on ? 'on' : 'off'); } catch (err) { /* preference is best effort */ }
    if (on) this.save();
    else AutoSave.remove(AUTOSAVE_KEY);
  }

  save() {
    if (!this.enabled) return false;
    try {
      AutoSave.write(AUTOSAVE_KEY, JSON.stringify({ savedAt: Date.now(), world: this.sim.serialize() }));
      this.lastSaved = Date.now();
      this.lastError = null;
      return true;
    } catch (err) {
      // Usually the browser's storage quota; the world keeps running, it just isn't kept.
      this.lastError = err;
      return false;
    }
  }

  // Resume the stored world unless the address asks for a different seed.
  // Returns { resumed, savedAt } or { resumed: false, reason } so the caller can tell the viewer.
  restore(requestedSeed = null) {
    if (!this.enabled) return { resumed: false };
    const raw = AutoSave.read(AUTOSAVE_KEY);
    if (!raw) return { resumed: false };
    let data;
    try {
      data = JSON.parse(raw);
      if (requestedSeed && data.world.seed !== requestedSeed) return { resumed: false };
      this.sim.load(data.world);
    } catch (err) {
      AutoSave.remove(AUTOSAVE_KEY);
      return { resumed: false, reason: `Your saved progress could not be resumed and was removed: ${err.message}` };
    }
    this.lastSaved = data.savedAt;
    return { resumed: true, savedAt: data.savedAt };
  }

  // Save on a timer and whenever the page is hidden or closed, so little is lost.
  start() {
    setInterval(() => this.save(), this.interval);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(); });
    window.addEventListener('pagehide', () => this.save());
  }
}
