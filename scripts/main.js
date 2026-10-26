// =============================================
// MAIN ENTRY POINT - Bus Driving Game
// =============================================

import * as THREE from 'three';
import {
    COLORS, FOG_COLOR, FOG_NEAR, FOG_FAR,
    LANE_LEFT, PLAYER_START_Z, PIXEL_SCALE
} from './constants.js';
import { initInput, getKeys, setKey, releaseAllKeys, DRIVING_KEY_CODES } from './input.js';
import { createCameraController, zoomForViewport } from './camera.js';
import { createSkyDome, createLighting, createGround, followGroundAndSky } from './environment.js';
import { createEndlessWorld } from './endless.js';
import { createBusStand } from './busstand.js';
import { createBus, makeAICars, updateAICars } from './vehicles.js';
import { makePedestrians, updatePedestrians } from './pedestrians.js';
import { updateBusPhysics } from './physics.js';
import { createJourney } from './journey.js';
import { createAutopilot } from './autopilot.js';
import { createHUD, updateHUD, createMusicUI, setHudTouchMode, setHudMobileMode } from './hud.js';
import { createMusicPlayer } from './music.js';
import { isTouchDevice } from './touch.js';

// --- Renderer ---
// The scene still renders at a reduced resolution for the pixel-art look, but
// antialiasing is on and CSS uses 'auto' scaling so the result stays clear
// instead of blocky.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

// Render at 1/PIXEL_SCALE of the window resolution and let CSS scale it up.
// 'auto' lets the browser smooth the upscale, which reads much cleaner than
// nearest-neighbour 'pixelated' at these sizes.
function resizeRenderer() {
    const width = Math.max(1, Math.floor(window.innerWidth / PIXEL_SCALE));
    const height = Math.max(1, Math.floor(window.innerHeight / PIXEL_SCALE));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'auto';
}

resizeRenderer();
document.body.appendChild(renderer.domElement);

// --- Scene ---
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

// --- Window Resize Handler ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    resizeRenderer();

    // Re-frame the camera: phones get a pulled-back view
    updateCamera.setZoom(zoomForViewport(window.innerWidth, window.innerHeight));
});

// --- Initialize Input ---
initInput();

// --- Create Environment ---
const skyDome = createSkyDome();
scene.add(skyDome);

const { sun, sunTarget, hemiLight, sunGlow } = createLighting();
scene.add(sun);
scene.add(sunTarget);
sun.target = sunTarget;
scene.add(hemiLight);
scene.add(sunGlow);

const ground = createGround();
scene.add(ground);

// --- Create Vehicles ---
// The bus drives towards -Z, so it starts with the whole endless road ahead.
const bus = createBus();
bus.position.set(LANE_LEFT, 0, PLAYER_START_Z);
bus.rotation.y = 0;
scene.add(bus);

// --- The endless road, with dhabas, petrol pumps, boards and pot holes ---
const world = createEndlessWorld({ bus, scene });

// --- The Indian bus stand the journey starts from ---
// The bus is parked in the bay; once the player pulls out it is left behind.
const busStand = createBusStand({ z: PLAYER_START_Z + 6 });
scene.add(busStand);

const aiCars = makeAICars();
aiCars.forEach(car => scene.add(car));

// --- Create Pedestrians ---
const pedestrians = makePedestrians(8);
pedestrians.forEach(ped => scene.add(ped));

// --- Create Camera Controller ---
const updateCamera = createCameraController(camera, bus);

// Zoom out on narrow / portrait screens so the road and roadside stay readable
updateCamera.setZoom(zoomForViewport(window.innerWidth, window.innerHeight));

// --- Trip meter (distance driven, next town) ---
const journey = createJourney(bus);

// --- Autopilot (driven by the AUTO button) ---
const autopilot = createAutopilot(bus, setKey);

/**
 * Starts / stops the AI driver.
 * @returns {boolean} true when the autopilot is now driving
 */
function toggleAutopilot() {
    const active = autopilot.toggle();

    // Player input and the AI never fight over the keys: when AUTO takes over
    // the manual keys are released, and pressing a driving key cancels AUTO
    // again (see the keydown listener below).
    if (active) releaseAllKeys();

    updateHUDStatus();

    return active;
}

/**
 * Pushes the current game state into the HUD.
 */
function updateHUDStatus() {
    updateHUD(hud, bus.userData.speed, {
        status: journey.status,
        distanceKm: journey.getState().distanceKm,
        nextTown: journey.nextTown,
        potholes: world.getState().potholesEnabled,
        auto: autopilot.getState()
    });
}

// --- Create HUD (the AUTO button is wired to the autopilot) ---
const hud = createHUD({ onToggleAuto: () => toggleAutopilot() });

// Any driving key press hands control back to the player
window.addEventListener('keydown', (e) => {
    if (!autopilot.isActive()) return;
    if (DRIVING_KEY_CODES.includes(e.code)) {
        autopilot.disengage('AUTO OFF');
    }
});

// --- Touch / mobile layout ---
// Phones get ONE control: the AUTO DRIVE button at the bottom of the screen.
// The driving pad, the keyboard hints and the music buttons are all left out,
// so nothing competes with the single button.
const touchDevice = isTouchDevice();
setHudTouchMode(hud, touchDevice);
setHudMobileMode(hud, touchDevice);

// --- Create Music Player (plays the files in song/) ---
// On mobile the panel is read-only: it shows the track but has no buttons.
const musicPlayer = createMusicPlayer();
createMusicUI(musicPlayer, { showButtons: !touchDevice });

// Browsers block autoplay until the user interacts with the page
musicPlayer.startOnFirstInteraction();

// Music shortcuts: N = next track, M = mute, P = play/pause
// (ignored while a HUD button has focus so the buttons stay usable)
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && e.target.tagName === 'BUTTON') return;
    if (e.code === 'KeyN') musicPlayer.next();
    if (e.code === 'KeyM') musicPlayer.setMuted(!musicPlayer.getState().isMuted);
    if (e.code === 'KeyP') musicPlayer.toggle();
});

// --- Game Loop ---
let lastTime = performance.now();

function animate(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt at 100ms
    lastTime = time;

    const keys = getKeys();

    // The AI driver writes into the same key state the player uses
    autopilot.update(dt, aiCars, world.potholes);

    // Update bus physics (movement + collisions + pot hole bumps)
    updateBusPhysics(bus, aiCars, pedestrians, keys, dt, { potholes: world.potholes });

    // Keep the endless world wrapped around the bus: road, scenery and holes
    const worldState = world.update(dt);

    // Advance the trip meter (distance driven, next town)
    journey.update(dt);

    // Update AI cars (they react to the player bus)
    updateAICars(aiCars, dt, bus);

    // Update pedestrians
    updatePedestrians(pedestrians, dt, bus);

    // Keep the shadow camera centred on the bus so shadows work anywhere on
    // the endless road
    sunTarget.position.set(bus.position.x, 0, bus.position.z);
    sun.position.set(
        bus.position.x + COLORS.SUN_POSITION.x,
        COLORS.SUN_POSITION.y,
        bus.position.z + COLORS.SUN_POSITION.z
    );

    // The ground and sky are finite meshes: move them with the bus, otherwise
    // the land beside the road turns black once the bus outruns them
    followGroundAndSky(ground, skyDome, bus);

    // Update camera
    updateCamera(dt);

    // Update HUD (speed + distance + next town + AUTO button)
    updateHUD(hud, bus.userData.speed, {
        status: journey.status,
        distanceKm: journey.getState().distanceKm,
        nextTown: journey.nextTown,
        potholes: worldState.potholesEnabled,
        auto: autopilot.getState()
    });

    // Update sun glow position (follow sun direction)
    const sunDir = new THREE.Vector3(
        COLORS.SUN_POSITION.x,
        COLORS.SUN_POSITION.y,
        COLORS.SUN_POSITION.z
    ).normalize();
    sunGlow.position.copy(sunDir).multiplyScalar(400).add(
        new THREE.Vector3(bus.position.x, 0, bus.position.z)
    );

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Exposed for debugging and for the headless smoke test (scripts/smoke.mjs)
globalThis.__scene = scene;
globalThis.__bus = bus;
globalThis.__aiCars = aiCars;
globalThis.__music = musicPlayer;
globalThis.__camera = camera;
globalThis.__renderer = renderer;
globalThis.__hud = hud;
globalThis.__world = world;
globalThis.__busStand = busStand;
globalThis.__ground = ground;
globalThis.__skyDome = skyDome;
globalThis.__journey = journey;
globalThis.__autopilot = autopilot;
globalThis.__toggleAutopilot = toggleAutopilot;

console.log('Three.js Revision:', THREE.REVISION);
console.log('Bus Driving Game initialized successfully!');
console.log('Systems: Scene, Lighting, Endless 4-Lane Road, Bus Stand, Dhabas, Petrol Pumps, Distance Boards, Pot Holes, Trees, Bus, AI Cars, Pedestrians, Camera, Physics, Journey, Autopilot, HUD, Touch');
