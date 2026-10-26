# Hotel Hollowmere

A kid-friendly 3D first-person horror-comedy escape game that runs in the browser. It is Halloween night: you were kidnapped by ghosts and wake up in the cellar of an old hotel. Solve the quests and escape through the front door.

Everything is generated in code: graphics are Three.js primitives with canvas-drawn textures, and all sound is synthesized with Web Audio. There are no asset files.

## Run it

```bash
npm install
npm run dev      # dev server (Vite prints the URL, usually http://localhost:5173)
npm run build    # type-check + production build into dist/
```

Click the screen to start (this also enables sound and mouse look).

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Run (louder, the Concierge hears it from farther away) |
| Mouse | Look |
| E | Interact / pick up / hide / leave hiding spot |
| F | Flashlight on/off |
| Q or click | Light flash: stuns the Concierge |
| H | Ask the Rolling Eye for directions |
| M | Toggle big map |

## Gameplay

**Goal:** complete 7 quests and leave through the front door.

1. Find the flashlight in your cell.
2. Read the ledger in the library for the safe code.
3. Open the lobby safe (code `4271`) to get the boiler room key.
4. Unlock the boiler room and take the fuse.
5. Put the fuse in the kitchen fuse box (restores power).
6. Take the brass key from the kitchen freezer (needs power).
7. Unlock the front door.

**Characters**

### Good

- **The Rolling Eye** — A flying eyeball helper. It follows you, warns you about monsters, tells jokes, and shows the route to the goal when you press `H`.

### Bad

- **The Concierge** — A gaunt ghost bellhop with a brass bell. He patrols, hears you when you move (running is louder), sees you in line of sight, and chases you. Hide in a wardrobe or flash him (`Q`/click) to blind him for 5 seconds.
- **Sparky** — An electric ghost drawn to electricity: wall switches, a lit flashlight, light flashes, and the fuse-box surge. If he is near, **freeze** (stand still with the flashlight off). If he sees you move, he chases you; on contact he drains battery and short-circuits the flashlight.
- **Humman** — A tall, black, humming goofball with googly eyes, a huge grin, and a crooked top hat. He appears a few seconds after **all** lights are on and slowly follows you. Flip any switch **off** and he melts away. He trips over his own feet every several seconds, can be stunned with a light flash, and gets confused if you hide. His off-key humming gets louder as he nears.

### Neutral

- **Bats** — Harmless little flocks flutter around the hotel near the ceiling. They make no noise, do not affect quests or monsters, and flutter away if you approach.

There are currently no other neutral characters.

If any monster catches you, you are sent back to the cell with a few seconds of safety. There is no game over.

**Systems:** flashlight battery (pickups restore it), per-room light switches, a fog-of-war minimap (bottom-right) that reveals as you explore, a quest counter, a level-complete screen with your time, and funny framed wall paintings.

## Project structure

| File | Purpose |
|---|---|
| [index.html](index.html) | Page, HUD, overlay and code-pad styles |
| [src/main.ts](src/main.ts) | Game setup, shared state, interactables, player input, quests, and main loop |
| [src/world.ts](src/world.ts) | Three.js scene, generated textures, level geometry, lights, and wall paintings |
| [src/characters/index.ts](src/characters/index.ts) | Creates characters and connects their shared context |
| [src/characters/types.ts](src/characters/types.ts) | Shared character context and game-state types |
| [src/characters/concierge.ts](src/characters/concierge.ts) | Concierge patrol, hearing, chasing, and animation |
| [src/characters/sparky.ts](src/characters/sparky.ts) | Sparky's electrical reactions, freeze mechanic, and animation |
| [src/characters/humman.ts](src/characters/humman.ts) | Humman's lights-on arrival, chasing, stumbling, and animation |
| [src/characters/rolling-eye.ts](src/characters/rolling-eye.ts) | Rolling Eye guidance, warnings, dialogue, and animation |
| [src/characters/bats.ts](src/characters/bats.ts) | Neutral bat models, flock placement, and flutter animation |
| [src/minimap.ts](src/minimap.ts) | Fog-of-war map drawing, revealed rooms, and character markers |
| [src/pickup-models.ts](src/pickup-models.ts) | Procedural 3D models for the flashlight, battery, and fuse |
| [src/map.ts](src/map.ts) | Level layout as text (`#` wall, `.` floor, `D` boiler door, `E` exit), cell size, patrol route |
| [src/audio.ts](src/audio.ts) | Synthesized sound effects and ambience |
| [vite.config.ts](vite.config.ts) | Vite config (`base: "./"` so it works under a GitHub Pages sub-path) |
| [.github/workflows/deploy.yml](.github/workflows/deploy.yml) | Builds and deploys to GitHub Pages on push to `main` |

## Editing the game

- **Level:** edit `MAP` in `src/map.ts`. Coordinates elsewhere are cell coordinates (x, y), converted with `cellToWorld`.
- **Quests/objects:** add them in `src/main.ts` with `pickup(...)`, `furniture(...)` or `addEnt(...)`; update `objective()`, `objectiveSpot()`, `questsDone()` and `QUESTS`.
- **Monster tuning:** character speeds and ranges are in their respective files under `src/characters/`; player noise is set in `update()` in `src/main.ts`.
- **Debug hook:** in dev mode only, `window.__dbg` exposes the game state for testing. It is not in production builds.

## Publishing (GitHub Pages)

1. Push the repo to GitHub (public, or a paid plan for private Pages).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Each push to `main` deploys to `https://<user>.github.io/<repo>/`.

## Roadmap

- More atmosphere (music box, dust, cobwebs, peeking ghosts, random events).
- Quest checklist with a progress bar.
- More floors and quests, a save system, and more varied wall art and furniture.
