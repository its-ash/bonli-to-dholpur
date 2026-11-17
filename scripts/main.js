// =============================================
// MAIN ENTRY POINT - Bonli to Jaipur Bus Simulator
// =============================================

import * as THREE from 'three';
import {
    COLORS, FOG_COLOR, FOG_NEAR, FOG_FAR,
    LANE_LEFT, PLAYER_START_Z, PIXEL_SCALE, ROUTE
} from './constants.js';
import { initInput, getKeys, setKey, setSteer, releaseAllKeys, DRIVING_KEY_CODES, setActionHandler } from './input.js';
import { createCameraController, zoomForViewport, CAMERA_MODE_LABELS } from './camera.js';
import { createBusAudio } from './audio.js';
import { createSkyDome, createLighting, createGround, followGroundAndSky, snapSunToTexels, configureRenderer } from './environment.js';
import { createEndlessWorld } from './endless.js';
import { registerJunctionZones, createJunctions } from './junctions.js';
import { createLandscape } from './landscape.js';
import { createBusStand } from './busstand.js';
import { createVillageCluster } from './shops.js';
import { createBus, makeAICars, updateAICars } from './vehicles.js';
import { makePedestrians, updatePedestrians } from './pedestrians.js';
import { updateBusPhysics } from './physics.js';
import { createJourney, JOURNEY_STATUS, loadBest, saveBest } from './journey.js';
import { createAutopilot } from './autopilot.js';
import {
    createHUD, updateHUD, createMusicUI, setHudTouchMode, setHudMobileMode, createGameScreens, showZoneToast,
    createDashboard, updateDashboard, createSoundSettingsUI
} from './hud.js';
import { createSoundSettings } from './settings.js';
import { createBiomeManager } from './biomes.js';
import { createMusicPlayer } from './music.js';
import { createBusSim } from './bussim.js';
import { addStraightZone, roadPoint, lateralOffset } from './roadpath.js';
import { isTouchDevice, createTouchControls, createTouchSwitches } from './touch.js';

// Set after a restart so the reloaded page goes straight to the road
const AUTOSTART_KEY = 'bonli-jaipur-autostart';
// Seconds between pulling into Jaipur and the summary appearing
const SUMMARY_DELAY = 1.6;

// Junction sites become straight road zones. MUST run before anything reads the
// road path (createEndlessWorld, scenery, stops), i.e. before the world is built.
registerJunctionZones();

// --- Renderer ---
// The scene still renders at a reduced resolution for the pixel-art look, but
// antialiasing is on and CSS uses 'auto' scaling so the result stays clear
// instead of blocky.
const renderer = new THREE.WebGLRenderer({ antialias: true });
configureRenderer(renderer);
if (renderer.setPixelRatio) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

// Render at 1/PIXEL_SCALE of the window resolution and let CSS scale it up.
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
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 1000);
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
// The bus drives towards -Z along the route, starting at Bonli.
// The road bends everywhere except where something has to be built square-on:
// the two bus stands and every route stop (shelter + village strip).
addStraightZone(PLAYER_START_Z, 50);
addStraightZone(PLAYER_START_Z - ROUTE.LENGTH, 50);
ROUTE.STOPS.forEach(stop => addStraightZone(PLAYER_START_Z - stop.km * ROUTE.UNITS_PER_KM, 50));

const bus = createBus();
const spawn = roadPoint(PLAYER_START_Z, LANE_LEFT);
bus.position.set(spawn.x, 0, spawn.z);
bus.rotation.y = spawn.heading;
scene.add(bus);

// --- The road, with dhabas, petrol pumps and boards ---
const world = createEndlessWorld({ bus, scene });

// --- Roundabouts, crossroads and T-junctions with working traffic lights ---
const junctions = createJunctions({ scene, bus });

// --- Forests, ponds, lakes and mountains beyond the roadside ---
const landscape = createLandscape({ bus, scene });

// --- Trip: progress, towns, statuses and the score ---
const journey = createJourney(bus);

// --- Biomes: farmland, hills, desert and coast zones along the route ---
const biomes = createBiomeManager({
    scene, bus, journey, landscape, renderer, ground, skyDome, sun, hemiLight,
    onZoneChange: (zone) => showZoneToast(`Entering ${zone.en} / ${zone.name}`)
});

// --- Bus simulation: fuel, route stops with passengers and fares, safety, horn ---
const busSim = createBusSim({
    bus, scene, pumps: world.pumps,
    onStopServed: (id) => journey.markStopServed(id)
});

// --- The Bonli bus stand the journey starts from ---
const busStand = createBusStand({ z: PLAYER_START_Z + 6 });
scene.add(busStand);

// --- The Jaipur (Sindhi Camp) bus stand the journey ends at ---
const END_Z = PLAYER_START_Z - ROUTE.LENGTH;
const endStand = createBusStand({ z: END_Z + 6, name: ROUTE.END_NAME });
endStand.userData.isEndStand = true;
scene.add(endStand);

// --- A village strip (chai, kirana, houses) at every village stop, on the shelter side ---
const villages = ROUTE.STOPS.filter(stop => stop.kind === 'village').map(stop => {
    const village = createVillageCluster(stop.name, { side: -1 });
    const at = roadPoint(PLAYER_START_Z - stop.km * ROUTE.UNITS_PER_KM, 0);
    village.position.set(at.x, 0, at.z);
    village.rotation.y = at.heading;
    scene.add(village);
    return village;
});

const aiCars = makeAICars();
aiCars.forEach(car => scene.add(car));

// --- Create Pedestrians ---
const pedestrians = makePedestrians(8);
pedestrians.forEach(ped => scene.add(ped));

// --- Create Camera Controller ---
const updateCamera = createCameraController(camera, bus);
updateCamera.setZoom(zoomForViewport(window.innerWidth, window.innerHeight));

// --- Autopilot (driven by the AUTO button) ---
const autopilot = createAutopilot(bus, setKey, setSteer);

/**
 * The nearest petrol pump still ahead of the bus.
 * @returns {{gap: number, side: number}|null}
 */
function pumpAhead() {
    let best = null;
    for (const pump of world.pumps) {
        const gap = bus.position.z - pump.position.z;
        if (gap > -4 && (!best || gap < best.gap)) best = { gap, side: pump.userData.side };
    }
    return best;
}

// Tells the AI driver where to pull up: compulsory town stops, a petrol pump
// when the tank is low, and the end of the route.
autopilot.setGuide(() => {
    const status = journey.status;
    if (status !== JOURNEY_STATUS.DRIVING && status !== JOURNEY_STATUS.AT_STOP) return null;
    if (bus.userData.doorsOpen) return { gap: 0, hold: true };

    let target = null;
    const consider = (gap) => { if (gap > -6 && (!target || gap < target.gap)) target = { gap, hold: false }; };

    for (const stop of busSim.stops) {
        if (stop.userData.stopKind === 'town' && !stop.userData.served) consider(bus.position.z - stop.position.z);
    }

    const sim = busSim.getState();
    if (sim.fuelPercent < 40) {
        const pump = world.pumps
            .filter(p => p.userData.side < 0)
            .map(p => bus.position.z - p.position.z)
            .filter(gap => gap > -6)
            .sort((a, b) => a - b)[0];
        if (pump !== undefined) consider(pump);
    }
    // At a pump: wait until the tank is full again
    if (sim.fuelPercent < 99 && Math.abs(bus.userData.speed) < 1 &&
        world.pumps.some(p => Math.abs(bus.position.z - p.position.z) < 12 && p.userData.side < 0) &&
        Math.abs(lateralOffset(bus.position.x, bus.position.z)) > 3) {
        return { gap: 0, hold: true };
    }

    consider(bus.position.z - END_Z);
    return target;
});

/**
 * Starts / stops the AI driver.
 * @returns {boolean} true when the autopilot is now driving
 */
function toggleAutopilot() {
    if (game.paused || journey.status === JOURNEY_STATUS.READY) return autopilot.isActive();
    const active = autopilot.toggle();
    if (active) releaseAllKeys();
    updateHUDStatus();
    return active;
}

// --- Game flow: title -> driving -> (paused) -> summary -> restart ---
const game = { paused: false, ended: false, endTimer: 0, summary: null };
const touchDevice = isTouchDevice();
const audio = createBusAudio();

function startGame() {
    if (journey.status !== JOURNEY_STATUS.READY) return;
    journey.start();
    audio.start();
    screens.hideTitle();
    releaseAllKeys();
    updateHUDStatus();
}

function setPaused(paused) {
    const status = journey.status;
    if (paused && status !== JOURNEY_STATUS.DRIVING && status !== JOURNEY_STATUS.AT_STOP) return;
    if (game.paused === paused) return;
    game.paused = paused;
    releaseAllKeys();
    if (paused) screens.showPause(); else screens.hidePause();
}

function togglePause() { setPaused(!game.paused); }

function restart() {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AUTOSTART_KEY, '1');
    } catch (e) {
        // Storage can be blocked; the title screen simply shows again
    }
    // Reloading rebuilds the whole world, so every road piece, stop and tank starts fresh
    if (typeof location !== 'undefined' && location.reload) location.reload();
}

function endTrip() {
    game.ended = true;
    autopilot.disengage('');
    releaseAllKeys();
    if (journey.status === JOURNEY_STATUS.ARRIVED) busSim.finish();
    game.summary = journey.getSummary(busSim.getState());
    game.endTimer = SUMMARY_DELAY;
}

/**
 * Pushes the current game state into the HUD.
 */
function updateHUDStatus() {
    const sim = busSim.getState();
    const journeyState = journey.getState();
    updateHUD(hud, bus.userData.speed, {
        status: journey.status,
        distanceKm: journeyState.distanceKm,
        nextTown: journey.nextTown,
        journey: journeyState,
        objective: journey.objective(sim, pumpAhead()),
        auto: autopilot.getState(),
        sim
    });
}

// --- Create HUD (the AUTO button is wired to the autopilot) ---
const hud = createHUD({ onToggleAuto: () => toggleAutopilot(), onPause: () => togglePause() });

const screens = createGameScreens({
    touch: touchDevice,
    onStart: () => startGame(),
    onResume: () => setPaused(false),
    onRestart: () => restart(),
    onSound: () => openSoundSettings()
});

// Any driving key press hands control back to the player
window.addEventListener('keydown', (e) => {
    if (!autopilot.isActive()) return;
    if (DRIVING_KEY_CODES.includes(e.code)) {
        autopilot.disengage('AUTO OFF');
    }
});

// --- Touch / mobile layout ---
// Phones get a compact info card (with AUTO DRIVE) in the top-left corner, a
// thumb pad at the bottom and round switches above the pedals.
setHudTouchMode(hud, touchDevice);
setHudMobileMode(hud, touchDevice);

// --- Create Music Player (plays the files in song/) ---
const musicPlayer = createMusicPlayer();
createMusicUI(musicPlayer, { showButtons: !touchDevice, compact: touchDevice, onSettings: () => openSoundSettings() });
musicPlayer.startOnFirstInteraction();

// --- Sound settings: music and game sound (switch + volume each), saved ---
const soundSettings = createSoundSettings();
const soundUI = createSoundSettingsUI({
    settings: soundSettings,
    player: musicPlayer,
    onTestSound: () => busSim.honk()
});
soundSettings.onChange((s) => {
    musicPlayer.setVolume(s.musicVolume);
    musicPlayer.setMuted(!s.musicOn);
    audio.setVolume(s.sfxVolume);
    audio.setMuted(!s.sfxOn);
    busSim.setHornVolume(s.sfxOn ? s.sfxVolume : 0);
});

/** Opens the sound settings; a trip in progress is paused first. */
function openSoundSettings() {
    if (!game.ended) setPaused(true);   // ignored on the title screen
    releaseAllKeys();
    soundUI.open();
}

// --- Engine / world audio, dashboard, camera key and touch switches ---
const dash = createDashboard({ mobile: touchDevice });
setActionHandler((name) => { if (name === 'camera') updateCamera.cycleMode(); });
if (touchDevice) {
    // Steering on the left thumb, brake / accelerator on the right
    createTouchControls(() => autopilot.disengage('AUTO OFF'));
    createTouchSwitches({
        onManualInput: () => autopilot.disengage('AUTO OFF'),
        onCamera: () => updateCamera.cycleMode()
    });
}

// H = horn
window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !e.repeat) busSim.honk();
});

// P / Esc = pause, Enter = start from the title screen, R = restart when the trip is over
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // Esc closes the sound settings first
    if (e.code === 'Escape' && soundUI.isOpen()) {
        soundUI.close();
        return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
        if (journey.status === JOURNEY_STATUS.READY) return;
        togglePause();
        return;
    }
    if (e.code === 'Enter' && journey.status === JOURNEY_STATUS.READY) startGame();
    if (e.code === 'KeyR' && game.ended && game.endTimer <= 0) restart();
});

// Music shortcuts: N = next track, M = mute / unmute music and game sound
// (ignored while a HUD button or slider has focus so they stay usable)
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && ['BUTTON', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'KeyN') musicPlayer.next();
    if (e.code === 'KeyM') soundSettings.toggleAll();
});

// --- Title screen (or straight to the road after a restart) ---
let autostart = false;
try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(AUTOSTART_KEY)) {
        sessionStorage.removeItem(AUTOSTART_KEY);
        autostart = true;
    }
} catch (e) {
    autostart = false;
}
if (autostart) startGame(); else screens.showTitle(loadBest());

// --- Game Loop ---
let lastTime = performance.now();

function animate(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt at 100ms
    lastTime = time;

    const keys = getKeys();
    const status = journey.status;
    const driving = !game.paused && status !== JOURNEY_STATUS.READY;

    if (driving) {
        // The AI driver writes into the same key state the player uses
        autopilot.update(dt, aiCars);

        // Bus physics (movement + collisions), then stops, fuel, fares, safety
        updateBusPhysics(bus, aiCars, pedestrians, keys, dt);
        busSim.update(dt);
        journey.update(dt);

        if (!game.ended &&
            (journey.status === JOURNEY_STATUS.ARRIVED || journey.status === JOURNEY_STATUS.GAME_OVER)) {
            endTrip();
        }
    }

    if (!game.paused) {
        // Keep the world wrapped around the bus: road and scenery
        world.update(dt);
        junctions.update(dt);
        landscape.update(dt);
        biomes.update(dt);
        updateAICars(aiCars, dt, bus);
        updatePedestrians(pedestrians, dt, bus);
    }

    // Summary screen, shortly after the trip ends
    if (game.ended && game.endTimer > 0) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) {
            const result = { score: game.summary.score, stars: game.summary.stars, time: game.summary.time };
            const best = loadBest();
            const newBest = game.summary.arrived ? saveBest(result) : false;
            screens.showSummary(game.summary, { newBest, best: newBest ? result : best });
        }
    }

    // Keep the shadow camera centred on the bus
    // (snapped to shadow-map texels so shadow edges do not shimmer)
    snapSunToTexels(sun, sunTarget, bus.position, COLORS.SUN_POSITION);

    // The ground and sky are finite meshes: move them with the bus
    followGroundAndSky(ground, skyDome, bus);

    // Update camera
    updateCamera(dt);

    // Update HUD (speed, progress bar, objective, AUTO button)
    updateHUDStatus();
    audio.update(bus, dt, { paused: game.paused });
    updateDashboard(dash, bus.userData, {
        fuelPercent: busSim.getState().fuelPercent,
        cameraLabel: CAMERA_MODE_LABELS[updateCamera.getMode()],
        visible: status !== JOURNEY_STATUS.READY,
        hud
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
globalThis.__soundSettings = soundSettings;
globalThis.__soundUI = soundUI;
globalThis.__camera = camera;
globalThis.__renderer = renderer;
globalThis.__hud = hud;
globalThis.__world = world;
globalThis.__junctions = junctions;
globalThis.__busStand = busStand;
globalThis.__endStand = endStand;
globalThis.__villages = villages;
globalThis.__ground = ground;
globalThis.__skyDome = skyDome;
globalThis.__journey = journey;
globalThis.__autopilot = autopilot;
globalThis.__toggleAutopilot = toggleAutopilot;
globalThis.__busSim = busSim;
globalThis.__landscape = landscape;
globalThis.__biomes = biomes;
globalThis.__screens = screens;
globalThis.__game = game;
globalThis.__audio = audio;
globalThis.__dashboard = dash;
globalThis.__startGame = startGame;
globalThis.__togglePause = togglePause;
globalThis.__restart = restart;

console.log('Three.js Revision:', THREE.REVISION);
console.log('Bonli to Jaipur Bus Simulator initialized successfully!');
console.log('Systems: Scene, Lighting, Route, Bus Stands, Town and Village Stops, Dhabas, Petrol Pumps, Distance Boards, Trees, Forests, Ponds, Lakes, Mountains, Bus, AI Cars, Pedestrians, Camera, Physics, Journey, Autopilot, Bus Simulation, HUD, Touch');
