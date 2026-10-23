# Neural Tidepool

An artificial life simulation in plain JavaScript. Creatures share a glowing deep-sea world, each steered by its own small neural network. In the default mode their bodies evolve too: size, speed, agility, sight and diet are inherited genes, and plant-eaters, hunters and everything in between emerge from them.

No libraries, no build step: open `index.html` in a browser and it runs.

## Two worlds

Switch between them at the top of the panel. Switching resets the world.

### Evolving bodies (default)

Every creature carries a genome of five body genes. Offspring inherit their parent's genome with small random changes, so bodies drift and specialise over generations.

| Gene | Range | What it buys | What it costs |
| --- | --- | --- | --- |
| Size | 0.6–1.8 | Bigger energy store; can eat bigger prey; harder to eat | Higher upkeep, slower turning, costlier offspring |
| Speed | 0.6–1.5 | Higher top speed and acceleration | Higher upkeep |
| Agility | 0.6–1.5 | Faster turning | Higher upkeep |
| Sight | 0.6–1.6 | Longer sensor range | Upkeep rises with the square of range |
| Diet | 0–1 | 0 digests plants only, 1 digests meat only | Plant and meat efficiency trade off directly; a meat diet adds a hunter's metabolism |

**Who can eat whom** is not assigned. A creature can eat another when all three hold:
- its diet gives it enough meat digestion to hunt at all
- the prey's diet is clearly more plant-leaning than its own
- the prey is not much bigger than it

That means a plant-eater can escape predation by growing large, at the price of higher upkeep.

Colour follows diet: green for plants, violet for mixed, red for meat. Shape follows the diet group (teardrop, kite, arrow) and drawn size follows the size gene. The panel groups creatures by diet (plant-eaters below 0.33, meat-eaters above 0.67). It also shows a live histogram of the diet gene and the population's average body.

The founders start in three loose diet clusters. A diet group that falls below 3 creatures, or a world below 30, is topped up with mutated copies of the best genomes so far, so a lineage can recover from an early wipe-out.

### Classic species

Three fixed species with a hardcoded food chain. Only their brains evolve.

| Species | Shape | Eats |
| --- | --- | --- |
| Herbivore (green) | Teardrop | Plants |
| Omnivore (purple) | Curved kite | Plants, herbivores |
| Carnivore (red) | Notched arrow | Herbivores, omnivores |

A species that falls below its minimum is topped up with mutated copies of its best past brains.

In both worlds, plants (yellow) grow mostly around a few fertile zones that drift slowly across the world.

## How a creature thinks

Every creature has a feedforward network with 11 inputs, one hidden layer of 12 neurons (tanh) and 4 outputs (sigmoid). The network controls all movement. There are no hardcoded steering rules.

**Inputs**

- Direction and closeness of the nearest plant, nearest threat and nearest prey within its sight
- Three wall rays: straight ahead, ahead-left and ahead-right
- Its own energy and speed

**Outputs**

- Turn left, turn right, accelerate, brake

Whether a creature flees threats or chases prey depends entirely on what its network has evolved.

## Energy, reproduction and evolution

- Creatures lose energy every tick just by existing, lose more the faster they move, and pay a small penalty for hitting a wall.
- Eating restores energy. After a kill, a hunter must digest for a short while before it can eat prey again.
- A creature that passes its energy threshold splits off one offspring. The child gets a copy of the parent's network with some weights randomly changed (the Mutation rate slider sets how many). In evolving bodies mode the body genes mutate too, at half that rate, because body changes are more drastic.
- A creature dies when its energy reaches zero, when it is eaten, or when it reaches old age.

## Controls

| Control | What it does |
| --- | --- |
| Evolving bodies / Classic species | Picks the world. Resets it. |
| Pause, 1x, 2x, 5x, Max | Time scale. Max runs as many steps as fit in each frame. |
| Plant spawn rate | New plants per second |
| Energy drain | Multiplier on all energy costs |
| Mutation rate | Share of weights (and, at half rate, body genes) that change in each offspring |
| Sensor range | Baseline sight in pixels; the sight gene multiplies it |
| Reset world | Starts over with fresh random brains and founders |
| Click a creature | Shows its network firing live, plus its body genes, in the inspector |

Keyboard: `Space` pauses and resumes, `1` to `5` pick a speed.

## Project layout

```
index.html             page markup; loads the stylesheet and scripts
css/styles.css         all styling
js/utils.js            shared helpers (random numbers, clamping, angles, diet colour)
js/config.js           species settings, gene ranges, evolving-mode rules, network shape
js/Vector.js           2D vector
js/NeuralNetwork.js    feedforward network: forward pass, clone, mutate
js/Genome.js           body genes: random founders, mutation, expression into traits
js/Plant.js            food pellet
js/Agent.js            one creature: sensing, thinking, moving, energy
js/SpatialGrid.js      grid for fast nearest-neighbour and collision lookups
js/ParticleSystem.js   pooled particles for eating, birth and death bursts
js/Simulation.js       world state, rules, both modes and the fixed-step game loop
js/Renderer.js         canvas drawing: glowing sprites, trails, selection
js/UIController.js     panel, dashboard, charts and brain inspector
js/main.js             startup
```

The scripts are loaded as ordinary scripts in a fixed order rather than as ES modules, so the page also works when opened straight from disk.

## Performance notes

- Nearest-neighbour searches use a spatial grid whose cell size equals the longest possible sight, so each creature checks only the 3×3 cells around it.
- Glow is baked into sprites once with `shadowBlur`, then drawn rotated and scaled each frame instead of blurring live. Evolving mode uses one sprite per diet step.
- Network activations and particles use preallocated buffers, so the main loop creates very little garbage.

## Tuning

- **Classic balance:** lives in `SPECIES` in `js/config.js`.
- **Evolving balance:**
  - `Genome.express()` in `js/Genome.js` holds how genes turn into traits and costs.
  - `EVOLVE` in `js/config.js` holds the hunting rules, mutation sizes, founders and population floors.

With the default settings, both worlds were run for 5 to 15 minutes of sim time:
- **Classic:** predator and prey populations rise and fall in cycles.
- **Evolving bodies:** plant-eaters and meat-eaters usually coexist and sustain themselves through their own births. The mixed-diet niche is weak and often survives only on its floor. Results vary noticeably from run to run.
