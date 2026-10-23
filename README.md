# Neural Tidepool

An artificial life simulation in plain JavaScript. Creatures share a glowing deep-sea world, each steered by its own small neural network. Their bodies evolve too: size and diet are inherited genes, and bodies are built from parts (eyes, fins, jaws, spikes, armour, fat) that mutate, appear and disappear. Plant-eaters, hunters and everything in between emerge from them, and lineages that drift apart become separate species, shown in a live family tree.

No libraries, no build step: open `index.html` in a browser and it runs.

## Bodies: genes and parts

Every creature carries a genome: two genes and a list of body parts. Offspring inherit it with small random changes, so bodies drift and specialise over generations.

| Gene | Range | What it buys | What it costs |
| --- | --- | --- | --- |
| Size | 0.6–1.8 | Bigger energy store; can eat bigger prey; harder to eat | More mass, so higher upkeep and slower movement; costlier offspring |
| Diet | 0–1 | 0 digests plants only, 1 digests meat only; meat-leaning bodies are faster and raise better-provisioned young | Plant and meat digestion trade off, favouring specialists; a meat diet adds a hunter's metabolism and costlier offspring |

| Part | Max | Heritable settings | What it does |
| --- | --- | --- | --- |
| Eye | 4 | direction, reach, width | A creature only sees what falls inside one of its eyes' cones (or touches it). Where the eyes point decides what the brain can react to: a rear eye spots hunters, a long narrow eye spots distant prey. |
| Fin | 4 | position, power | Fins toward the tail push the body forward; fins on the flanks steer. Without fins a body barely drifts. |
| Jaw | 1 | power | Needed to kill at all. Stronger jaws take bigger prey: up to 1.15× the hunter's size for the weakest jaw, 1.65× for the strongest. |
| Spike | 6 | length | Gives each bite a chance to fail, and hurts the attacker when it does. |
| Armour | 2 | thickness | Gives each bite a better chance to fail than spikes do, without hurting the attacker. |
| Fat | 2 | amount | Raises the energy store. |

Every part adds mass and upkeep, and mass slows the body and raises its running cost, so evolution keeps only what pays for itself. A child can gain a random part, lose one, or have its parts' settings nudged. Body changes mutate at half the brain's rate.

**Who can eat whom** is not assigned. A creature can eat another when all of these hold:
- it has a jaw, and its diet gives it enough meat digestion to hunt at all
- the prey's diet is clearly more plant-leaning than its own
- the prey is small enough for its jaw
- it can see the prey

Even then, the prey's spikes and armour may turn the bite away. A plant-eater can escape predation by growing large or growing defences, at the price of mass and upkeep.

Colour follows the species by default (see below), or the diet if you switch it: green for plants, violet for mixed, red for meat. Shape follows the diet group (teardrop, kite, arrow), drawn size follows the size gene, and every part is drawn on the body: eyes as white dots, fins, jaws at the front, spikes, an armour ring and a fat patch. The selected creature's eye cones are shown on the map. The panel also shows a live histogram of the diet gene and the average body and parts per diet group (plant-eaters below 0.33, meat-eaters above 0.67). The diet groups are only for display and top-ups; the rules for eating never look at them.

Plants (yellow) grow mostly around a few fertile zones that drift slowly across the world.

The founders start in three loose diet clusters. A diet group that falls below 3 creatures, or a world below 30, is topped up with mutated copies of the best genomes so far, so a lineage can recover from an early wipe-out.

## Species and the family tree

Species are not assigned. They split off by genetic distance:

- Every species remembers the body it was founded with, its **representative**.
- A newborn joins its parent's species as long as its body stays within a distance of **1.5** of that representative.
- The first newborn beyond that distance founds a **new species**, which branches off its parent's species in the family tree. Its brothers and sisters that stayed close remain in the old species, so both can live on side by side.
- A top-up copied from a species that has died out founds a new branch instead of reviving the old species.

The distance between two bodies adds up:

| Difference | Counts as |
| --- | --- |
| Diet | 4 per unit (plants-only vs meat-only = 4) |
| Size | 2 across the whole size range |
| Number of parts | 0.5 per part more or fewer of one type (an extra eye, a lost jaw) |
| Part settings | up to 1 per matching part, by how far its settings (direction, reach, power and so on) have moved across their range |

So a species splits when its diet shifts by about 0.4, or when it has gained or lost three parts and its other settings have drifted a little, or when a mix of smaller changes adds up. The brain is not part of the distance: brains change every generation and two very different networks can steer the same way, so species are defined by body.

Each species gets a generated name and a colour. Root species take their colour from their diet; a branch shifts its parent's hue a little, so related species look alike. Species tracking draws nothing from the seeded random generator, so it never changes how a world plays out.

**In the panel**, the species list shows the largest living species with their average diet and when they were founded, and the chart above it stacks every species' population over the last 150 seconds, with related species next to each other. Click a species to highlight all its members on the map.

**The family tree** (button in the panel, or `T`) draws one line per species against time, from when it was founded to when it died out or to now. A short vertical line joins each species to the one it branched from at the moment it split. Living species are drawn in their colour, thicker the more members they have, and labelled with their name and size; extinct species are grey. Hover a line for details, click it to highlight that species on the map. Extinct species that never reached 3 members are hidden unless something descends from them, since most are single newborns that died before breeding; untick *Extinct branches* to see only living species and their ancestors. Dead ends are dropped from the tree 3 minutes after they die out (sooner once it holds 400 species); ancestors of living species are always kept.

**In the inspector**, the selected creature's species is shown with what it branched from; *Highlight species* marks its relatives on the map.

## How a creature thinks

Every creature has a feedforward network with 14 inputs, one hidden layer of 12 neurons (tanh) and 4 outputs (sigmoid). The network controls all movement. There are no hardcoded steering rules.

**Inputs**

- Direction and closeness of the nearest plant, nearest threat and nearest prey that its eyes can see
- The size of that threat and that prey, relative to its own body
- Three wall rays: straight ahead, ahead-left and ahead-right
- Its own energy and speed, and how much longer it is still digesting a kill

**Outputs**

- Turn left, turn right, accelerate, brake

Whether a creature flees threats or chases prey depends entirely on what its network has evolved.

## Energy, reproduction and evolution

- Creatures lose energy every tick just by existing, lose more the faster they move, and pay a small penalty for hitting a wall.
- Eating restores energy. After a kill, a hunter must digest for a short while before it can eat prey again.
- A creature that passes its energy threshold splits off one offspring. The child gets a copy of the parent's network with some weights randomly changed (the Mutation rate slider sets how many). Its body mutates too, at half that rate, because body changes are more drastic.
- A creature dies when its energy reaches zero, when it is eaten, or when it reaches old age.

## Controls

| Control | What it does |
| --- | --- |
| Pause, 1x, 2x, 5x, Max | Time scale. Max runs as many steps as fit in each frame. |
| Plant spawn rate | New plants per second |
| Energy drain | Multiplier on all energy costs |
| Mutation rate | Share of weights (and, at half rate, body genes and parts) that change in each offspring |
| Sensor range | Baseline sight in pixels; each eye's reach multiplies it |
| Seed, Replay seed | Shows the current world's seed; type one and press Replay seed to start that world |
| New world | Starts a fresh world with a new random seed |
| Save world | Downloads the whole world (creatures, brains, plants, statistics, settings) as a JSON file |
| Load world | Opens a saved world and continues it exactly where it left off |
| Keep progress in this browser | On by default: the world is kept in this browser and resumed on your next visit. Turning it off removes the kept world. |
| Species list | Click a species to highlight its members on the map; click again to stop |
| Family tree | Opens the family tree of species |
| Colour: Species, Diet | Colours creatures by species or by diet |
| Click a creature | Shows its network firing live, its body, parts and species in the inspector, and its eye cones on the map |

Keyboard: `Space` pauses and resumes, `1` to `5` pick a speed, `T` opens or closes the family tree, `C` switches the colours.

## Seeds and saved worlds

Saved worlds include the species and the family tree. Worlds saved before species existed still load: their creatures are grouped into species by body when they load, with a fresh family tree.

Every rule in the simulation draws from one seeded random generator (`js/Random.js`). The same seed, window size and settings therefore replay the same world, tick for tick. The seed is shown in the panel and kept in the address, so `index.html?seed=4242` reopens world 4242. Particles are purely visual and use their own randomness, so drawing never changes a run.

**Progress in this browser.** The current world is also kept in this browser's localStorage, every 30 seconds and whenever you switch away from or close the tab. Opening the page again resumes it, including its settings, unless the address asks for a different seed (`?seed=`), which starts that world instead. A long run takes roughly 0.5 to 1 MB; if the browser refuses the space, the panel says so and you can still use Save world. Storage stays in this browser on this device only.

A saved world also stores the generator's position, so loading it continues exactly as if it had never stopped. If the window is a different size than when it was saved, creatures outside the window are moved inside and the run no longer replays exactly; the panel says so.

## Headless balance runner

`tools/headless.js` runs the same simulation classes in Node without drawing, over many seeds, and reports how each diet group fares in the second half of each run, plus how many species are alive at the end, how many of those have at least 5 members, and how many were founded:

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
| `--set key=value` | | Override a setting, such as `plantRate=20`, `EVOLVE.dietGap=0.15` or `SPECIES.threshold=2`; repeatable |
| `--json` | | Print full results as JSON |

A group counts as **thriving** in a run when, over the second half, its average population is at least twice its floor and its own births outnumber top-ups at least three to one. A 10-seed, 10-minute run takes a few minutes.

## Project layout

```
index.html             page markup; loads the stylesheet and scripts
css/styles.css         all styling
js/Random.js           seeded random generator shared by every simulation rule
js/utils.js            shared helpers (random numbers, clamping, angles, diet colour)
js/config.js           genes, part types, founder bodies, energy economy, evolution rules, save format
js/Vector.js           2D vector
js/NeuralNetwork.js    feedforward network: forward pass, clone, mutate
js/Genome.js           body genes and parts: founders, mutation, expression into traits
js/Species.js          species registry: splitting by genetic distance, names, colours, family-tree order
js/Plant.js            food pellet
js/Agent.js            one creature: sensing, thinking, moving, energy
js/SpatialGrid.js      grid for fast nearest-neighbour and collision lookups
js/ParticleSystem.js   pooled particles for eating, birth and death bursts
js/Simulation.js       world state, rules and the fixed-step game loop
js/Renderer.js         canvas drawing: glowing sprites, trails, selection
js/TreeView.js         family tree panel
js/UIController.js     panel, dashboard, species list, charts and brain inspector
js/AutoSave.js         keeps the world in localStorage and resumes it on the next visit
js/main.js             startup
tools/headless.js      Node runner for balance testing over many seeds
```

The scripts are loaded as ordinary scripts in a fixed order rather than as ES modules, so the page also works when opened straight from disk.

## Performance notes

- Nearest-neighbour searches use a spatial grid whose cell size equals the longest possible sight, so each creature checks only the 3×3 cells around it.
- Glow is baked into sprites once with `shadowBlur` (one sprite per diet step, and one per shape and 8° hue step for species colours, made the first time a species needs it), then drawn rotated and scaled each frame instead of blurring live.
- Network activations and particles use preallocated buffers, so the main loop creates very little garbage.

## Balance

- `BODY` in `js/config.js` holds the energy economy: food values, hunter metabolism, digestion, the diet curve, the hunter's speed and provisioning, and how well spikes and armour defend. Every value can be tried without editing code via `--set BODY.key=value` in the headless runner.
- `EVOLVE` in `js/config.js` holds the hunting rules, mutation sizes, founders and population floors.
- `SPECIES` in `js/config.js` holds the species threshold, the distance weights and how long extinct species stay in the tree. `Genome.distance()` in `js/Genome.js` computes the distance.
- `Genome.express()` in `js/Genome.js` turns genes, parts and these values into a creature's traits; each part's mass and upkeep are set there.

The defaults were chosen with the headless runner, in two rounds.

**Before body parts.** At first, meat-eaters thrived in 0 of 10 seeds (10 sim-minutes each) and survived only on top-ups: 143 births of their own against 343 top-ups. Instrumenting the runs showed why. Hunters saw prey 77% of the time but starved after about 17 seconds with roughly one kill each, because they were no faster than their prey and had too little starting energy to learn to hunt before dying. Plant-eaters also escaped by evolving larger bodies. The fix combined a speed bonus and better-provisioned young for meat-leaning bodies, richer meat, a cheaper hunter metabolism, a looser size limit and a digestion curve that favours specialists. That got meat-eaters thriving in 4 of 8 seeds (20 sim-minutes each), with 1,078 births against 202 top-ups.

**With body parts.** Adding parts first dropped meat-eaters to 2 of 8 seeds. Plant-eaters evolved smaller and dropped their costly rear eye, and since meat value follows the prey's mass, small prey fed hunters less. Richer meat (75 per unit of mass) and no extra hunter metabolism restored them. Over 8 seeds of 20 sim-minutes:

| Group | Thriving | Own births vs top-ups (second halves) |
| --- | --- | --- |
| Plant-eaters | 7 of 8 seeds | 14,047 vs 156 |
| Meat-eaters | 3 of 8 seeds | 1,732 vs 199 |
| Mixed diet | 1 of 8 seeds | 502 vs 550 |

Meat-eaters now sustain themselves more strongly than before parts (births outnumber top-ups almost 9 to 1), though they thrive in slightly fewer worlds. With effective hunters around, plant-eaters started to evolve spikes. The mixed diet remains a marginal niche that mostly lives on its floor. To reproduce these numbers:

```bash
node tools/headless.js --seeds 8 --minutes 20
```

## Earlier version

Before evolving bodies, the simulation had three fixed species (herbivore, omnivore, carnivore) with a hardcoded food chain where only the brains evolved. That version is kept under the git tag `classic-species`:

```bash
git checkout classic-species
```
