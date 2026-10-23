# Neural Tidepool

An artificial life simulation in plain JavaScript. Creatures share a glowing deep-sea world, each steered by its own small neural network. Their bodies evolve too: size, speed, agility, sight and diet are inherited genes, and plant-eaters, hunters and everything in between emerge from them.

No libraries, no build step: open `index.html` in a browser and it runs.

## Bodies and genes

Every creature carries a genome of five body genes. Offspring inherit their parent's genome with small random changes, so bodies drift and specialise over generations.

| Gene | Range | What it buys | What it costs |
| --- | --- | --- | --- |
| Size | 0.6–1.8 | Bigger energy store; can eat bigger prey; harder to eat | Higher upkeep, slower turning, costlier offspring |
| Speed | 0.6–1.5 | Higher top speed and acceleration | Higher upkeep |
| Agility | 0.6–1.5 | Faster turning | Higher upkeep |
| Sight | 0.6–1.6 | Longer sensor range | Upkeep rises with the square of range |
| Diet | 0–1 | 0 digests plants only, 1 digests meat only; meat-leaning bodies are faster and raise better-provisioned young | Plant and meat digestion trade off, favouring specialists; a meat diet adds a hunter's metabolism and costlier offspring |

**Who can eat whom** is not assigned. A creature can eat another when all three hold:
- its diet gives it enough meat digestion to hunt at all
- the prey's diet is clearly more plant-leaning than its own
- the prey is at most 1.4 times its size

That means a plant-eater can escape predation by growing large, at the price of higher upkeep.

Colour follows diet: green for plants, violet for mixed, red for meat. Shape follows the diet group (teardrop, kite, arrow) and drawn size follows the size gene. The panel groups creatures by diet (plant-eaters below 0.33, meat-eaters above 0.67), shows a live histogram of the diet gene, and shows the population's average body. The groups are only for display; the rules never look at them.

Plants (yellow) grow mostly around a few fertile zones that drift slowly across the world.

The founders start in three loose diet clusters. A diet group that falls below 3 creatures, or a world below 30, is topped up with mutated copies of the best genomes so far, so a lineage can recover from an early wipe-out.

## How a creature thinks

Every creature has a feedforward network with 14 inputs, one hidden layer of 12 neurons (tanh) and 4 outputs (sigmoid). The network controls all movement. There are no hardcoded steering rules.

**Inputs**

- Direction and closeness of the nearest plant, nearest threat and nearest prey within its sight
- The size of that threat and that prey, relative to its own body
- Three wall rays: straight ahead, ahead-left and ahead-right
- Its own energy and speed, and how much longer it is still digesting a kill

**Outputs**

- Turn left, turn right, accelerate, brake

Whether a creature flees threats or chases prey depends entirely on what its network has evolved.

## Energy, reproduction and evolution

- Creatures lose energy every tick just by existing, lose more the faster they move, and pay a small penalty for hitting a wall.
- Eating restores energy. After a kill, a hunter must digest for a short while before it can eat prey again.
- A creature that passes its energy threshold splits off one offspring. The child gets a copy of the parent's network with some weights randomly changed (the Mutation rate slider sets how many). Its body genes mutate too, at half that rate, because body changes are more drastic.
- A creature dies when its energy reaches zero, when it is eaten, or when it reaches old age.

## Controls

| Control | What it does |
| --- | --- |
| Pause, 1x, 2x, 5x, Max | Time scale. Max runs as many steps as fit in each frame. |
| Plant spawn rate | New plants per second |
| Energy drain | Multiplier on all energy costs |
| Mutation rate | Share of weights (and, at half rate, body genes) that change in each offspring |
| Sensor range | Baseline sight in pixels; the sight gene multiplies it |
| Seed, Replay seed | Shows the current world's seed; type one and press Replay seed to start that world |
| New world | Starts a fresh world with a new random seed |
| Save world | Downloads the whole world (creatures, brains, plants, statistics, settings) as a JSON file |
| Load world | Opens a saved world and continues it exactly where it left off |
| Click a creature | Shows its network firing live, plus its body genes, in the inspector |

Keyboard: `Space` pauses and resumes, `1` to `5` pick a speed.

## Seeds and saved worlds

Every rule in the simulation draws from one seeded random generator (`js/Random.js`). The same seed, window size and settings therefore replay the same world, tick for tick. The seed is shown in the panel and kept in the address, so `index.html?seed=4242` reopens world 4242. Particles are purely visual and use their own randomness, so drawing never changes a run.

A saved world also stores the generator's position, so loading it continues exactly as if it had never stopped. If the window is a different size than when it was saved, creatures outside the window are moved inside and the run no longer replays exactly; the panel says so.

## Headless balance runner

`tools/headless.js` runs the same simulation classes in Node without drawing, over many seeds, and reports how each diet group fares in the second half of each run:

```bash
node tools/headless.js --seeds 10 --minutes 10
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--seeds N` | 10 | Number of seeds to run |
| `--seed-start S` | 1 | First seed; seeds run S, S+1, … |
| `--minutes M` | 10 | Sim-minutes per run (60 ticks per second) |
| `--size WxH` | 1280x800 | World size |
| `--set key=value` | | Override a setting, such as `plantRate=20` or `EVOLVE.dietGap=0.15`; repeatable |
| `--json` | | Print full results as JSON |

A group counts as **thriving** in a run when, over the second half, its average population is at least twice its floor and its own births outnumber top-ups at least three to one. A 10-seed, 10-minute run takes a few minutes.

## Project layout

```
index.html             page markup; loads the stylesheet and scripts
css/styles.css         all styling
js/Random.js           seeded random generator shared by every simulation rule
js/utils.js            shared helpers (random numbers, clamping, angles, diet colour)
js/config.js           gene ranges, evolution and population rules, network shape, save format
js/Vector.js           2D vector
js/NeuralNetwork.js    feedforward network: forward pass, clone, mutate
js/Genome.js           body genes: random founders, mutation, expression into traits
js/Plant.js            food pellet
js/Agent.js            one creature: sensing, thinking, moving, energy
js/SpatialGrid.js      grid for fast nearest-neighbour and collision lookups
js/ParticleSystem.js   pooled particles for eating, birth and death bursts
js/Simulation.js       world state, rules and the fixed-step game loop
js/Renderer.js         canvas drawing: glowing sprites, trails, selection
js/UIController.js     panel, dashboard, charts and brain inspector
js/main.js             startup
tools/headless.js      Node runner for balance testing over many seeds
```

The scripts are loaded as ordinary scripts in a fixed order rather than as ES modules, so the page also works when opened straight from disk.

## Performance notes

- Nearest-neighbour searches use a spatial grid whose cell size equals the longest possible sight, so each creature checks only the 3×3 cells around it.
- Glow is baked into sprites once with `shadowBlur` (one sprite per diet step), then drawn rotated and scaled each frame instead of blurring live.
- Network activations and particles use preallocated buffers, so the main loop creates very little garbage.

## Balance

- `BODY` in `js/config.js` holds the energy economy: food values, hunter metabolism, digestion, the diet curve and the hunter's speed and provisioning. Every value can be tried without editing code via `--set BODY.key=value` in the headless runner.
- `EVOLVE` in `js/config.js` holds the hunting rules, mutation sizes, founders and population floors.
- `Genome.express()` in `js/Genome.js` turns genes and these values into a creature's traits.

The defaults were chosen with the headless runner. Before tuning, meat-eaters thrived in 0 of 10 seeds (10 sim-minutes each) and survived only on top-ups: 143 births of their own against 343 top-ups. Instrumenting the runs showed why. Hunters saw prey 77% of the time but starved after about 17 seconds with roughly one kill each, because they were no faster than their prey and had too little starting energy to learn to hunt before dying. Plant-eaters also escaped by evolving larger bodies.

The fix combines a speed bonus and better-provisioned young for meat-leaning bodies, richer meat with a cheaper hunter metabolism, a looser size limit (1.4×) and a digestion curve that favours specialists. Over 8 seeds of 20 sim-minutes:

| Group | Thriving | Own births vs top-ups (second halves) |
| --- | --- | --- |
| Plant-eaters | 7 of 8 seeds | 13,121 vs 83 |
| Meat-eaters | 4 of 8 seeds | 1,078 vs 202 |
| Mixed diet | 1 of 8 seeds | 914 vs 524 |

Meat-eaters now usually sustain themselves, but not in every world. The mixed diet remains a marginal niche that mostly lives on its floor. To reproduce these numbers:

```bash
node tools/headless.js --seeds 8 --minutes 20
```

## Earlier version

Before evolving bodies, the simulation had three fixed species (herbivore, omnivore, carnivore) with a hardcoded food chain where only the brains evolved. That version is kept under the git tag `classic-species`:

```bash
git checkout classic-species
```
