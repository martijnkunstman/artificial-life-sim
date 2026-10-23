# Neural Tidepool

An artificial life simulation in plain JavaScript. Herbivores, omnivores and carnivores share a glowing deep-sea world. Each creature is steered by its own small neural network, and those networks evolve as creatures eat, reproduce with mutations and die.

No libraries, no build step: open `index.html` in a browser and it runs.

## The species

| Species | Shape | Eats | Flees from |
| --- | --- | --- | --- |
| Herbivore (green) | Teardrop | Plants | Omnivores, carnivores |
| Omnivore (purple) | Curved kite | Plants, herbivores | Carnivores |
| Carnivore (red) | Notched arrow | Herbivores, omnivores | Nothing |

Plants (yellow) grow mostly around a few fertile zones that drift slowly across the world.

The "Flees from" column describes the intended pressure, not a rule in the code: whether a creature actually flees depends on what its network has evolved.

## How a creature thinks

Every creature has a feedforward network with 11 inputs, one hidden layer of 12 neurons (tanh) and 4 outputs (sigmoid). The network controls all movement. There are no hardcoded steering rules.

**Inputs**

- Direction and closeness of the nearest plant, nearest threat and nearest prey within sensor range
- Three wall rays: straight ahead, ahead-left and ahead-right
- Its own energy and speed

**Outputs**

- Turn left, turn right, accelerate, brake

## Energy, reproduction and evolution

- Creatures lose energy every tick just by existing, lose more the faster they move, and pay a small penalty for hitting a wall.
- Eating restores energy. Predators need a short digestion pause after each kill before they can eat prey again.
- A creature that passes its species' energy threshold splits off one offspring. The child gets a copy of the parent's network with some weights randomly changed (the Mutation rate slider sets how many).
- A creature dies when its energy reaches zero, when it is eaten, or when it reaches old age.
- If a species falls below a minimum population, it is topped up with mutated copies of the best brains that species has produced so far. The panel shows how often this has happened.

## Controls

| Control | What it does |
| --- | --- |
| Pause, 1x, 2x, 5x, Max | Time scale. Max runs as many steps as fit in each frame. |
| Plant spawn rate | New plants per second |
| Energy drain | Multiplier on all energy costs |
| Mutation rate | Share of weights that change in each offspring |
| Sensor range | How far creatures can see, in pixels |
| Reset world | Starts over with fresh random brains |
| Click a creature | Shows its network firing live in the inspector |

Keyboard: `Space` pauses and resumes, `1` to `5` pick a speed.

The dashboard shows each species' population, deepest living generation and total births, plus elapsed sim time and a population history chart.

## Project layout

```
index.html             page markup; loads the stylesheet and scripts
css/styles.css         all styling
js/utils.js            shared helpers (random numbers, clamping, angles)
js/config.js           species settings, predator/prey rules, network shape
js/Vector.js           2D vector
js/NeuralNetwork.js    feedforward network: forward pass, clone, mutate
js/Plant.js            food pellet
js/Agent.js            one creature: sensing, thinking, moving, energy
js/SpatialGrid.js      grid for fast nearest-neighbour and collision lookups
js/ParticleSystem.js   pooled particles for eating, birth and death bursts
js/Simulation.js       world state, rules and the fixed-step game loop
js/Renderer.js         canvas drawing: glowing sprites, trails, selection
js/UIController.js     panel, dashboard, chart and brain inspector
js/main.js             startup
```

The scripts are loaded as ordinary scripts in a fixed order rather than as ES modules, so the page also works when opened straight from disk.

## Performance notes

- Nearest-neighbour searches use a spatial grid whose cell size equals the sensor range, so each creature checks only the 3×3 cells around it.
- Glow is baked into sprites once with `shadowBlur`, then drawn rotated each frame instead of blurring live.
- Network activations and particles use preallocated buffers, so the main loop creates very little garbage.

## Tuning

Species balance lives in `js/config.js`: speed, turn rate, energy costs, food value, reproduction thresholds, lifespan, starting numbers and population caps. With the default settings, predator and prey populations rise and fall in cycles, and herbivore lineages typically reach generation 60 to 80 within ten minutes of sim time.
