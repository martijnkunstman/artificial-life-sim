'use strict';

/* ---------- NeuralNetwork: dense feedforward, tanh hidden, sigmoid out ---------- */
class NeuralNetwork {
  constructor(sizes, empty = false) {
    this.sizes = sizes.slice();
    this.weights = [];
    this.biases = [];
    for (let l = 1; l < sizes.length; l++) {
      const n = sizes[l], m = sizes[l - 1];
      const w = new Float32Array(n * m), b = new Float32Array(n);
      if (!empty) {
        const s = 1.6 / Math.sqrt(m);
        for (let i = 0; i < w.length; i++) w[i] = gauss() * s;
        for (let i = 0; i < n; i++) b[i] = gauss() * 0.3;
      }
      this.weights.push(w);
      this.biases.push(b);
    }
    // Preallocated activations, reused every forward pass (and read by the inspector).
    this.layers = sizes.map(n => new Float32Array(n));
  }

  forward(input) {
    const L = this.layers, last = L.length - 1;
    L[0].set(input);
    for (let l = 1; l <= last; l++) {
      const prev = L[l - 1], out = L[l], w = this.weights[l - 1], b = this.biases[l - 1], m = prev.length;
      for (let j = 0; j < out.length; j++) {
        let s = b[j];
        const o = j * m;
        for (let i = 0; i < m; i++) s += w[o + i] * prev[i];
        out[j] = l === last ? 1 / (1 + Math.exp(-s)) : Math.tanh(s);
      }
    }
    return L[last];
  }

  clone() {
    const nn = new NeuralNetwork(this.sizes, true);
    for (let l = 0; l < this.weights.length; l++) {
      nn.weights[l].set(this.weights[l]);
      nn.biases[l].set(this.biases[l]);
    }
    return nn;
  }

  toJSON() {
    return {
      sizes: this.sizes,
      weights: this.weights.map(w => Array.from(w)),
      biases: this.biases.map(b => Array.from(b)),
    };
  }

  static fromJSON(d) {
    const nn = new NeuralNetwork(d.sizes, true);
    d.weights.forEach((w, l) => nn.weights[l].set(w));
    d.biases.forEach((b, l) => nn.biases[l].set(b));
    return nn;
  }

  mutate(rate, strength = 0.35) {
    const jitter = arr => {
      for (let i = 0; i < arr.length; i++) {
        if (!chance(rate)) continue;
        arr[i] = chance(0.06) ? gauss() : clamp(arr[i] + gauss() * strength, -4, 4);
      }
    };
    this.weights.forEach(jitter);
    this.biases.forEach(jitter);
    return this;
  }
}
