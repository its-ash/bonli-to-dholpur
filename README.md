# Bus Driving Game — बौंली highway

A pixel-art 3D bus driving game built with Three.js. You pull out of an Indian
bus stand onto a **four-lane highway that never ends**, past roadside dhabas,
petrol pumps and Hindi distance boards — with an AUTO DRIVE mode for when you just want to watch.

Live site: **https://bonli.itsash.in** (GitHub Pages, see `CNAME`)

---

## Quick start

There is **no build step and no dependencies to install** — it is plain ES
modules loaded through an import map.

`index.html` uses ES modules, so it must be served over HTTP (opening the file
directly with `file://` will not work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Any static server works (`npx serve`, `php -S`, nginx, GitHub Pages …).
Three.js r160 is pulled from unpkg via the `<script type="importmap">` in
`index.html`.

---

## Controls

### Desktop

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `N` | Next track |
| `P` | Play / pause music |
| `M` | Mute |
| `H` | Horn |

### Mobile

There is exactly **one** on-screen control: the **AUTO DRIVE** button pinned to
the bottom of the screen. Tap it to start the AI driver, tap again to stop. The
camera also pulls back automatically on narrow/portrait screens so more of the
road stays visible.

### AUTO DRIVE

The autopilot cruises at highway speed and keeps its lane. When a slower vehicle
is ahead and the outside lane is clear, it pulls out, passes, and slides back in
once the passed vehicle is behind. It stops itself if the road is blocked for too long. Pressing any driving key (or, on desktop, using
the music buttons) hands control back to you.

Steering is progressive: the wheel swings over in about a second, and a faster
bus needs a wider turn.

### Bus simulation

- **Fuel** — the 60 L tank burns while the engine runs, faster at speed. Stop on
  the kerb of a petrol pump's side of the road, next to its forecourt, to refuel.
  The status line warns when fuel is low or empty.
- **Bus stops** — kerb-side shelters on the left of the road. Pull into the outside
  lane beside a shelter and stop: the doors open for four seconds, passengers get
  off and the people waiting get on. Every boarding passenger pays a ₹12 fare,
  scaled by the safety score. The bus is held still while the doors are open.
- **Safety** — each collision with traffic costs 4 points, a pedestrian hit 12
  A lower safety score means lower fares.
- **Horn** — `H`.

---

## What is in the world

| Feature | Where | Notes |
| --- | --- | --- |
| Endless 4-lane road | `scripts/endless.js` | 16 recycled 60-unit segments that follow the bus; markings baked into one texture per segment |
| Bus stand | `scripts/busstand.js` | The start point — canopy, ticket office, waiting passengers, "बस स्टैंड / बौंली" board |
| Dhaba restaurants | `scripts/shops.js` | Awning, cooking counter, dining table with diners sitting and eating |
| Petrol pumps | `scripts/petrolpump.js` | Canopy, two dispensers, cashier kiosk, readable brand board |
| Bus stops, fuel, fares | `scripts/bussim.js` | Kerb-side shelters with waiting passengers, doors and fares, fuel burn and refuel, safety score, horn |
| Forests, ponds, lakes, mountains | `scripts/landscape.js` | Instanced pine/broadleaf forests, ponds with reeds and lily pads, lakes with a jetty and a bobbing boat, rugged mountain ranges coloured by height with snow caps; all recycled along the road, and trees never stand in water |
| Distance boards | `scripts/signs.js` | बौंली 12 km, सवाई माधोपुर 28 km, धौलपुर 46 km |
| AI traffic | `scripts/vehicles.js` | Same-direction cars in the near lanes, oncoming traffic across the centre line; a car stuck behind a slower one changes to the other lane of its direction when that lane is clear |
| Pedestrians | `scripts/pedestrians.js` | Walking along the verges, recycled around the player |
| Music | `scripts/music.js` | Plays `song/*.mp3`, auto-advances, starts on the first tap/key press |

The road is **12 units wide with four 3-unit lanes** at x = −4.5, −1.5, +1.5 and
+4.5, split by a double-yellow centre line at x = 0 and dashed dividers at ±3.
The bus drives towards −Z in the two negative-X lanes.

---

## Project layout

```
index.html              page shell, import map, mobile viewport setup
CNAME                   GitHub Pages custom domain
todo.md                 build history / feature checklist

scripts/
  main.js               entry point: scene, game loop, wiring
  constants.js          every tunable (lanes, sizes, speeds, colours)
  camera.js             follow camera + mobile zoom
  input.js              keyboard state + setKey() for the pad/autopilot
  physics.js            bus movement, collisions
  collision.js          oriented-box (OBB) collision tests
  vehicles.js           bus model, AI car model, traffic AI
  endless.js            endless road + recycled scenery
  environment.js        sky dome, lighting, ground, trees
  shops.js              dhaba restaurants
  petrolpump.js         petrol pumps
  signs.js              distance boards
  busstand.js           starting bus stand
  pedestrians.js        pedestrians
  journey.js            distance driven / next town meter
  autopilot.js          AUTO DRIVE AI driver (overtaking)
  bussim.js             bus stops, passengers, fares, fuel, safety, horn
  landscape.js          forests, ponds, lakes, mountains
  rounded.js            roundedBox(): rounded-edge boxes for vehicles and buildings
  hud.js                HUD, AUTO button, music panel, mobile layout
  music.js              music player
  touch.js              touch detection + on-screen pad
  utils.js              pixel-art canvas textures

  verify.mjs            static checks (syntax + required systems/exports)
  smoke.mjs             headless run of the real modules
```

---

## Tests

Two Node-only scripts, no test framework required:

```bash
node scripts/verify.mjs   # static: syntax + every module/export present
node scripts/smoke.mjs    # behavioural: boots the game against a stubbed three + DOM
```

`verify.mjs` reads the sources and asserts the required systems and exports
exist, then runs `node --check` on the entry point.

`smoke.mjs` is the more interesting one: it imports the **real** game modules
with a minimal stub for `three` and the DOM, boots `main.js`, then drives the
game frame by frame. It covers tyres, spawn direction, driving, wheel roll,
road clamping, AI braking, OBB separation, music behaviour, the heart decal,
the endless road recycling, dhaba/pump/sign placement, the four-lane split, the ground/sky follow, and the mobile layout and
camera zoom. Both scripts exit non-zero on failure.

> These tests caught several real bugs during development — an inverted
> autopilot steering sign, scenery placed in the middle of the road, a sky dome
> that culled itself into a black horizon, a mobile layout flag that read
> normalised inline styles, and an autoplay unlock that permanently disabled
> music after a single rejection.

---

## Adding a song

1. Drop the `.mp3` into `song/`.
2. Add its path to `SONG_PLAYLIST` in `scripts/constants.js`:

```js
export const SONG_PLAYLIST = [
    'song/Mujhse Mohabbat Ka Izhaar Karta.mp3',
    'song/Your New Song.mp3'
];
```

Tracks that fail to load are skipped automatically.

---

## Notes and limitations

* **Music and autoplay.** Browsers block audio until the user interacts with the
  page, so playback starts on the first tap, click or key press. Phones often
  reject that very first attempt; the listeners stay armed and retry on the next
  gesture rather than giving up.
* **No persistence.** Distance and settings reset on reload.
* **No asset pipeline.** Every texture is drawn procedurally on a `<canvas>` at
  low resolution for the pixel-art look, so there are no image files to load.
* **Rendering** happens at 1/`PIXEL_SCALE` of the window resolution and is
  smoothed back up by the browser. Set `PIXEL_SCALE = 1` in
  `scripts/constants.js` for full native sharpness, or `3` for a chunkier
  retro look (the value only affects the 3D scene, never the HUD text).
