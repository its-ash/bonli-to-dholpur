#!/usr/bin/env node
// =============================================
// HEADLESS SMOKE TEST
// verify.mjs only greps the sources; this script actually *runs* the game
// logic against a tiny stubbed `three` module, so physics regressions
// (tyre orientation, driving direction, AI car reactions) are caught.
// =============================================

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const FILES = [
    'constants.js', 'utils.js', 'environment.js', 'shops.js', 'signs.js',
    'petrolpump.js', 'busstand.js',
    'endless.js', 'vehicles.js',
    'collision.js', 'input.js', 'camera.js', 'physics.js', 'journey.js',
    'autopilot.js', 'bussim.js', 'touch.js', 'pedestrians.js', 'hud.js', 'music.js', 'main.js'
];

// ---------------------------------------------------------------- stub THREE
const THREE_STUB = `
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    lerp(v, a) {
        this.x += (v.x - this.x) * a;
        this.y += (v.y - this.y) * a;
        this.z += (v.z - this.z) * a;
        return this;
    }
    // Only Y rotations are used by the game, so the quaternion is an angle.
    applyQuaternion(q) {
        const a = q.angle;
        const cos = Math.cos(a), sin = Math.sin(a);
        const x = this.x, z = this.z;
        this.x = x * cos + z * sin;
        this.z = -x * sin + z * cos;
        return this;
    }
}

class Object3D {
    constructor() {
        this.position = new Vector3();
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = new Vector3(1, 1, 1);
        this.scale.setScalar = (s) => { this.scale.x = this.scale.y = this.scale.z = s; return this.scale; };
        this.children = [];
        this.userData = {};
        this.castShadow = false;
        this.receiveShadow = false;
        this.renderOrder = 0;
        this.visible = true;
        const owner = this;
        this.quaternion = {};
        Object.defineProperty(this.quaternion, 'angle', { get: () => owner.rotation.y });
    }
    add(child) { this.children.push(child); return this; }
    lookAt() {}
    updateMatrixWorld() {}
}

export { Object3D };
export class Group extends Object3D {}
export class Scene extends Object3D { constructor() { super(); this.fog = null; } }
export class Mesh extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class Sprite extends Object3D {
    constructor(material) { super(); this.material = material; }
}
export class PerspectiveCamera extends Object3D {
    constructor(fov, aspect) { super(); this.fov = fov; this.aspect = aspect; }
    updateProjectionMatrix() {}
}
export class BoxGeometry { constructor(w, h, d) { this.parameters = { width: w, height: h, depth: d }; } }
export class CylinderGeometry { constructor(r, r2, h) { this.parameters = { radiusTop: r, radiusBottom: r2, height: h }; } }
export class PlaneGeometry { constructor(w, h) { this.parameters = { width: w, height: h }; } }
export class SphereGeometry { constructor(r) { this.parameters = { radius: r }; } scale() {} }
export class Fog { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } }
export class Color {
    constructor(hex) { this.hex = hex; }
    multiplyScalar(s) { this.hex = this.hex * s; return this; }
}
export class CanvasTexture {
    constructor(canvas) { this.image = canvas; this.repeat = { set() {} }; }
    dispose() {}
}
class Material { constructor(opts = {}) { Object.assign(this, opts); } dispose() {} }
export class MeshStandardMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class SpriteMaterial extends Material {}
export class DirectionalLight extends Object3D {
    constructor() {
        super();
        this.shadow = {
            camera: {}, mapSize: { width: 0, height: 0 },
            bias: 0, normalBias: 0
        };
    }
}
export class HemisphereLight extends Object3D {}
export class WebGLRenderer {
    constructor() {
        this.domElement = { style: {} };
        this.shadowMap = { enabled: false, type: null };
        this.toneMapping = null;
        this.frames = 0;
    }
    setSize() {}
    setPixelRatio() {}
    render() { this.frames++; }
}
export const MathUtils = { clamp };
export const NearestFilter = 1003;
export const NearestMipmapNearestFilter = 1004;
export const LinearFilter = 1006;
export const LinearMipmapLinearFilter = 1008;
export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';
export const DoubleSide = 2;
export const FrontSide = 0;
export const AdditiveBlending = 2;
export const PCFShadowMap = 1;
export const NoToneMapping = 0;
export const REVISION = 'stub';
`;

// ------------------------------------------------------------- stub browser
function installBrowserStubs() {
    const noop = () => {};
    // Recording 2D context: enough surface for the pixel-art texture code,
    // and it remembers what was drawn so tests can assert on it.
    const makeContext2d = () => {
        const ctx = {
            fillStyle: '',
            strokeStyle: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            globalCompositeOperation: 'source-over',
            fillRect: function (x, y, w, h) {
                ctx.rects.push({ x, y, w, h, fill: ctx.fillStyle });
            },
            rects: [],
            clearRect: noop,
            beginPath: noop,
            closePath: noop,
            moveTo: noop,
            lineTo: noop,
            fill: noop,
            stroke: noop,
            save: noop,
            restore: noop,
            translate: noop,
            scale: noop,
            fillText: function (text, x, y) {
                ctx.drawnText.push({ text, x, y, font: ctx.font, fill: ctx.fillStyle, composite: ctx.globalCompositeOperation });
            },
            drawnText: [],
            measuredText: [],
            createRadialGradient: () => ({ addColorStop: noop }),
            createLinearGradient: () => ({ addColorStop: noop }),
            measureText: function (text) {
                // Rough proportional estimate: Devanagari needs extra room
                const devanagari = /[\u0900-\u097F]/.test(text);
                const sizeMatch = ctx.font.match(/(\d+(?:\.\d+)?)px/);
                const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
                const width = fontSize * (devanagari ? 0.78 : 0.55) * text.length;
                ctx.measuredText.push({ text, width, fontSize });
                return { width };
            }
        };
        return ctx;
    };
    const context2d = makeContext2d();

    const makeElement = (tagName = 'div') => {
        const element = {
            tagName: tagName.toUpperCase(),
            id: '',
            type: '',
            title: '',
            textContent: '',
            disabled: false,
            style: {},
            width: 0,
            height: 0,
            dataset: {},
            children: [],
            listeners: {},
            appendChild(child) {
                this.children.push(child);
                // A real DOM sets parentNode, and the HUD relies on it to remove
                // the music button row on mobile
                child.parentNode = this;
                return child;
            },
            removeChild(child) {
                const at = this.children.indexOf(child);
                if (at !== -1) this.children.splice(at, 1);
                child.parentNode = null;
                return child;
            },
            getContext: () => context2d,
            querySelector(selector) {
                const id = selector.replace(/^#/, '');
                const walk = (node) => {
                    for (const child of node.children || []) {
                        if (child.id === id) return child;
                        const hit = walk(child);
                        if (hit) return hit;
                    }
                    return null;
                };
                return walk(this);
            },
            querySelectorAll: () => [],
            setAttribute() {},
            getAttribute: () => null,
            setPointerCapture() {},
            releasePointerCapture() {},
            addEventListener(type, fn) {
                (this.listeners[type] = this.listeners[type] || []).push(fn);
            },
            removeEventListener(type, fn) {
                const list = this.listeners[type] || [];
                const at = list.indexOf(fn);
                if (at !== -1) list.splice(at, 1);
            },
            blur() {}
        };
        return element;
    };

    globalThis.__context2d = context2d;

    globalThis.document = {
        createElement: makeElement,
        body: makeElement('body'),
        // The HUD reaches for the music panel on mobile; walk the body for it
        querySelector(selector) {
            const id = selector.replace(/^#/, '');
            const walk = (node) => {
                for (const child of node.children || []) {
                    if (child.id === id) return child;
                    const hit = walk(child);
                    if (hit) return hit;
                }
                return null;
            };
            if (this.body.id === id) return this.body;
            return walk(this.body);
        }
    };

    const listeners = {};
    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 720,
        devicePixelRatio: 1,
        // Desktop: no touch screen, so the mobile pad is not built in tests
        matchMedia: (query) => ({ matches: false, media: query }),
        navigator: { maxTouchPoints: 0 },
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener: (type, fn) => {
            const list = listeners[type] || [];
            const at = list.indexOf(fn);
            if (at !== -1) list.splice(at, 1);
        },
        // Lets tests simulate a user gesture (needed for the autoplay unlock)
        dispatchEvent: (event) => {
            const list = (listeners[event.type] || []).slice();
            list.forEach(fn => fn(event));
            return true;
        }
    };
    globalThis.__listeners = listeners;
    globalThis.performance = globalThis.performance || { now: () => 0 };

    // Minimal HTMLAudioElement stand-in so the music module can be exercised
    const audios = [];
    class StubAudio extends EventTarget {
        constructor() {
            super();
            this.paused = true;
            this.muted = false;
            this.volume = 1;
            this.currentTime = 0;
            this.preload = '';
            this._src = '';
            this.playCalls = 0;
            audios.push(this);
        }
        get src() { return this._src; }
        set src(value) { this._src = value; }
        play() {
            this.playCalls++;
            this.paused = false;
            this.dispatchEvent(new Event('play'));
            return Promise.resolve();
        }
        pause() {
            this.paused = true;
            this.dispatchEvent(new Event('pause'));
        }
    }
    globalThis.Audio = StubAudio;
    globalThis.__audios = audios;
    if (typeof globalThis.Event !== 'undefined' && typeof globalThis.EventTarget !== 'undefined') {
        // Node already provides both; nothing to do
    }

    // Capture the animation loop instead of running it, so the test can step
    // frames at a controlled dt.
    globalThis.__frames = [];
    globalThis.requestAnimationFrame = (cb) => { globalThis.__frames.push(cb); return 0; };
}

// -------------------------------------------------------------------- checks
let failures = 0;
function check(name, condition, detail = '') {
    const status = condition ? 'PASS' : 'FAIL';
    if (!condition) failures++;
    console.log(`${condition ? '✅' : '❌'} ${status}: ${name}${detail ? ` (${detail})` : ''}`);
}

/**
 * Finds a stubbed DOM node by id, anywhere in the tree created by document.body
 * @param {string} selector - only '#id' selectors are supported
 * @returns {Object|null}
 */
function findNode(selector) {
    const id = selector.replace(/^#/, '');
    const walk = (node) => {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of node.children || []) {
            const hit = walk(child);
            if (hit) return hit;
        }
        return null;
    };
    return walk(globalThis.document.body) || globalThis.__musicPanel || null;
}

function musicUiPanel() {
    return findNode('#music');
}

async function main() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   Bus Driving Game - Headless Smoke      ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const tempDir = mkdtempSync(join(tmpdir(), 'bus-smoke-'));

    writeFileSync(join(tempDir, 'three-stub.mjs'), THREE_STUB);

    for (const file of FILES) {
        const source = readFileSync(join(SCRIPTS_DIR, file), 'utf-8');
        // Redirect the bare "three" specifier to the local stub
        const rewritten = source.replace(/from 'three'/g, "from './three-stub.mjs'");
        writeFileSync(join(tempDir, file), rewritten);
    }

    installBrowserStubs();

    const constants = await import(pathToFileURL(join(tempDir, 'constants.js')).href);

    // Importing main.js boots the whole game (scene, bus, traffic, loop).
    await import(pathToFileURL(join(tempDir, 'main.js')).href);

    check('game boots without runtime errors', true);

    // ---------------------------------------------------- find the live objects
    const scene = globalThis.__scene;
    check('scene was created', !!scene);

    const bus = scene.children.find(c => c.userData && c.userData.wheels && c.userData.maxSpeed);
    check('player bus exists in the scene', !!bus);

    const cars = scene.children.filter(c => c.userData && c.userData.isOncoming !== undefined && c !== bus);

    // ------------------------------------------------------- issue 1: tyres
    const tyre = bus.userData.wheels[0].children[0];
    check('bus tyre axle points along X (rotation.z = 90°)',
        Math.abs(tyre.rotation.z - Math.PI / 2) < 1e-6,
        `rotation.z=${tyre.rotation.z.toFixed(3)}`);
    check('bus tyre is not laid flat (rotation.x unchanged)',
        Math.abs(tyre.rotation.x) < 1e-6);

    // -------------------------------------------- issue 2: correct start side
    check('bus starts near the +Z end of the road',
        bus.position.z > 100,
        `z=${bus.position.z.toFixed(1)}`);
    check('bus starts in the left lane',
        Math.abs(bus.position.x - constants.LANE_LEFT) < 1e-6,
        `x=${bus.position.x.toFixed(1)}`);
    check('bus front (headlights) faces the driving direction (-Z)',
        Math.abs(bus.rotation.y) < 1e-6);

    // ------------------------------------------------------ drive the bus
    const keydown = globalThis.__listeners.keydown;
    const keyup = globalThis.__listeners.keyup;
    check('keyboard input is wired up', Array.isArray(keydown) && keydown.length > 0);

    const press = (code) => keydown.forEach(fn => fn({ code, preventDefault() {} }));
    const release = (code) => keyup.forEach(fn => fn({ code }));

    const startZ = bus.position.z;
    const startWheelSpin = bus.userData.wheels[0].rotation.x;

    const animate = globalThis.__frames[0];
    press('KeyW');
    let time = 0;
    for (let i = 0; i < 60; i++) {
        time += 16.7;
        animate(time);
    }
    release('KeyW');

    check('pressing W moves the bus forward (towards -Z)',
        bus.position.z < startZ - 5,
        `z ${startZ.toFixed(1)} → ${bus.position.z.toFixed(1)}`);
    check('wheels roll while driving',
        Math.abs(bus.userData.wheels[0].rotation.x - startWheelSpin) > 0.5,
        `spin=${(bus.userData.wheels[0].rotation.x - startWheelSpin).toFixed(2)} rad`);
    check('bus stays inside the road',
        Math.abs(bus.position.x) <= constants.ROAD_HALF_WIDTH,
        `x=${bus.position.x.toFixed(2)}`);

    // --------------------------------------------- issue 4: car physics react
    const busSpeedBefore = Math.abs(bus.userData.speed);
    check('bus has momentum after accelerating', busSpeedBefore > 1, `${busSpeedBefore.toFixed(1)} u/s`);

    // Put a car BEHIND the stopped bus, in its lane, driving towards it.
    // It must brake instead of driving straight through the bus.
    const car = cars.find(c => c.userData.isOncoming);
    const carSpeedBefore = car.userData.speed;
    car.position.set(constants.LANE_LEFT, 0, bus.position.z + 25);
    car.userData.laneX = constants.LANE_LEFT;
    car.userData.isOncoming = false;
    car.rotation.y = 0;
    car.userData.targetSpeed = 20;
    car.userData.speed = 20;
    // Lane changes are tested on their own below; here the car must brake
    car.userData.laneCooldown = 1e9;
    bus.userData.speed = 0;

    const collision = await import(pathToFileURL(join(tempDir, 'collision.js')).href);

    for (let i = 0; i < 240; i++) {
        time += 16.7;
        animate(time);
    }

    const gap = Math.abs(car.position.z - bus.position.z);
    check('AI car brakes for the stopped bus instead of driving through it',
        car.userData.speed < carSpeedBefore,
        `speed ${carSpeedBefore.toFixed(1)} → ${car.userData.speed.toFixed(1)} u/s`);
    check('AI car keeps a gap (no clipping into the bus)',
        gap > constants.BUS_LENGTH / 2,
        `gap=${gap.toFixed(2)}`);
    check('bus and car boxes do not overlap after the car brakes',
        collision.testBoxOverlap(collision.getVehicleBox(bus), collision.getVehicleBox(car)) === null);

    // Now force an overlap and check the collision response separates them
    car.position.set(bus.position.x, 0, bus.position.z - 2);
    car.userData.speed = 0;
    animate((time += 16.7));
    check('overlapping car is pushed out of the bus',
        collision.testBoxOverlap(collision.getVehicleBox(bus), collision.getVehicleBox(car)) === null,
        `Δz=${(car.position.z - bus.position.z).toFixed(2)}`);

    // ------------------------------------------------- render loop still runs
    check('render loop is driven by requestAnimationFrame',
        globalThis.__frames.length >= 1);

    // ------------------------------------------------------------- music
    const music = globalThis.__music;
    check('music player was created', !!music);
    check('playlist is loaded from song/',
        music.tracks.length > 0 && music.tracks.every(t => t.path.startsWith('song/')),
        music.tracks.map(t => t.path).join(', '));
    check('first track title is human readable',
        music.getState().title === 'Mujhse Mohabbat Ka Izhaar Karta',
        music.getState().title);

    const audioEl = globalThis.__audios[0];
    check('audio element points at the track file',
        audioEl.src === 'song/Mujhse Mohabbat Ka Izhaar Karta.mp3',
        audioEl.src);

    // Playback starts on the first user gesture (autoplay policy)
    const gesture = globalThis.__listeners.keydown;
    gesture.forEach(fn => fn({ code: 'ShiftLeft', target: { tagName: 'BODY' }, preventDefault() {} }));
    check('first key press starts playback',
        audioEl.playCalls > 0 && music.getState().isPlaying);

    // "next song" control: with one file it restarts the track
    const beforeNext = { index: music.getState().index, time: audioEl.currentTime };
    audioEl.currentTime = 12;
    music.next();
    check('next() with a single track restarts it',
        audioEl.currentTime === 0 && audioEl.playCalls > 1,
        `currentTime ${beforeNext.time} → ${audioEl.currentTime}`);
    check('playback continues after next()', audioEl.src.startsWith('song/') && music.getState().isPlaying);

    // A multi-track playlist must actually advance (drop more songs in song/ + constants)
    const { createMusicPlayer } = await import(pathToFileURL(join(tempDir, 'music.js')).href);
    const multi = createMusicPlayer({
        playlist: ['song/A.mp3', 'song/B.mp3', 'song/C.mp3']
    });
    check('multi-track playlist is built from the list', multi.getState().total === 3);
    multi.next();
    check('next() advances index on a multi-track playlist', multi.getState().index === 1, `index=${multi.getState().index}`);
    check('UI title follows the current track', multi.getState().title === 'B');
    multi.previous();
    check('previous() goes back a track', multi.getState().index === 0, `index=${multi.getState().index}`);
    multi.setMuted(true);
    check('mute is reflected in state', multi.getState().isMuted === true);

    // Empty playlist must not crash and must be reported to the UI
    const empty = createMusicPlayer({ playlist: [] });
    empty.next();
    empty.previous();
    empty.toggle();
    check('empty playlist degrades gracefully',
        empty.getState().hasTracks === false && empty.getState().title === 'NO TRACKS');

    music.setMuted(true);
    check('mute state is exposed to the UI', music.getState().isMuted === true);
    music.setMuted(false);

    music.toggle();
    check('toggle() pauses playback', music.getState().isPlaying === false);
    music.toggle();
    check('toggle() resumes playback', music.getState().isPlaying === true);

    // --- Autoplay unlock must survive a rejected first attempt ---
    // Phones routinely reject the first play() (not decoded yet / untrusted
    // gesture). The gesture listeners have to stay armed so the next tap can
    // retry - otherwise music is silently disabled forever on mobile.
    const gestureMusic = createMusicPlayer({ playlist: ['song/A.mp3'] });
    const gestureAudio = globalThis.__audios[globalThis.__audios.length - 1];

    // First attempt fails, exactly like a strict mobile browser
    let attempts = 0;
    gestureAudio.play = function () {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error('NotAllowedError'));
        this.paused = false;
        return Promise.resolve();
    };

    gestureMusic.startOnFirstInteraction();

    const userTap = () => window.dispatchEvent(new Event('pointerdown'));
    // play() resolves asynchronously, so let the microtask queue drain between taps
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    userTap();
    await settle();
    const afterFirst = gestureMusic.getState().isPlaying;

    userTap();
    await settle();
    const afterSecond = gestureMusic.getState().isPlaying;

    check('a rejected first autoplay attempt does not disable music',
        afterFirst === false && attempts >= 2,
        `attempts=${attempts}`);
    check('the next tap retries and starts playback',
        afterSecond === true);

    // A touch-only phone must be able to unlock music as well
    const touchMusic = createMusicPlayer({ playlist: ['song/A.mp3'] });
    const touchAudio = globalThis.__audios[globalThis.__audios.length - 1];
    let touchPlays = 0;
    touchAudio.play = function () { touchPlays += 1; this.paused = false; return Promise.resolve(); };
    touchMusic.startOnFirstInteraction();
    window.dispatchEvent(new Event('touchstart'));
    await settle();
    check('a touch gesture unlocks music on a phone',
        touchPlays > 0 && touchMusic.getState().isPlaying);

    // UI wiring
    check('music panel exists in the DOM', !!musicUiPanel());
    check('music panel exposes prev / play / next buttons',
        !!findNode('#music-prev') && !!findNode('#music-play') && !!findNode('#music-next'));

    const nextButton = findNode('#music-next');
    const timeBeforeClick = (audioEl.currentTime = 9);
    nextButton.listeners.click.forEach(fn => fn({ preventDefault() {} }));
    check('clicking NEXT in the UI restarts/changes the track',
        audioEl.currentTime === 0 || audioEl.currentTime !== timeBeforeClick,
        `currentTime=${audioEl.currentTime}`);

    const titleNode = findNode('#track-title');
    check('UI shows the current track title',
        titleNode.textContent.startsWith('MUSIC:'),
        titleNode.textContent);

    const counterNode = findNode('#track-counter');
    check('UI shows the track counter', /TRACK \d+ \/ \d+/.test(counterNode.textContent), counterNode.textContent);

    // ------------------------------------- rear heart decal (कुकू संग चुनमुन)
    const decal = bus.children.find(
        child => child.material && child.material.map && child.geometry &&
                 child.geometry.parameters && child.geometry.parameters.width === 1.8 &&
                 child.position.z > constants.BUS_LENGTH / 2
    );
    check('rear decal mesh exists on the bus', !!decal);
    check('decal sits on the rear face (+Z), not the front',
        decal && Math.abs(decal.position.z - (constants.BUS_LENGTH / 2 + 0.02)) < 1e-6,
        decal ? `z=${decal.position.z}` : 'missing');
    check('decal is centred on the bus', decal && decal.position.x === 0);
    check('decal is transparent (only the heart shows)',
        decal && decal.material.transparent === true);

    // The heart texture is drawn on the shared 2D context stub; every glyph
    // drawn with 'source-atop' is clipped inside the heart.
    const heartGlyphs = globalThis.__context2d.drawnText.filter(entry =>
        entry.text.includes('कुकू') || entry.text.includes('चुनमुन')
    );
    check('heart decal draws the Devanagari text', heartGlyphs.length > 0,
        heartGlyphs.map(g => g.text).slice(0, 2).join(' / '));
    check('text is clipped to the heart shape',
        heartGlyphs.length > 0 && heartGlyphs.every(g => g.composite === 'source-atop'),
        heartGlyphs[0] ? heartGlyphs[0].composite : 'none');
    check('text is centred horizontally',
        heartGlyphs.length > 0 && heartGlyphs.every(g => Math.abs(g.x - 64) <= 1));
    check('both words are rendered',
        heartGlyphs.some(g => g.text === 'कुकू संग') && heartGlyphs.some(g => g.text === 'चुनमुन'));

    // ------------------------------------- feature: endless road + scenery
    const world = globalThis.__world;
    check('endless world controller was created', !!world);

    const worldState = world.getState();
    check('the road is built from recycled segments',
        worldState.segmentCount >= 8, `${worldState.segmentCount} segments`);
    check('every segment is a road-surface mesh',
        world.segments.every(segment => segment.userData.isRoadSegment));
    check('no road-end barrier exists any more (the road is endless)',
        !scene.children.some(child => child.userData && child.userData.isRoadEnd));

    // ------------------------------------------ feature: dhaba restaurants
    check('dhaba restaurants exist along the road', world.dhabas.length >= 2,
        `${world.dhabas.length} dhabas`);
    check('dhabas sit off the asphalt',
        world.dhabas.every(dhaba =>
            Math.abs(dhaba.position.x) - dhaba.userData.buildingDepth / 2 > constants.ROAD_HALF_WIDTH),
        `nearest building edge x=${Math.min(...world.dhabas.map(d =>
            Math.abs(d.position.x) - d.userData.buildingDepth / 2)).toFixed(1)}`);
    check('dhabas stand on BOTH sides of the road',
        world.dhabas.some(dhaba => dhaba.position.x < 0) &&
        world.dhabas.some(dhaba => dhaba.position.x > 0));
    check('every dhaba is a named restaurant',
        world.dhabas.every(dhaba => dhaba.userData.isDhaba && dhaba.userData.signText),
        world.dhabas[0].userData.signText);
    check('dhabas have people sitting and eating',
        world.dhabas.every(dhaba => dhaba.userData.diners.length >= 3),
        `${world.dhabas[0].userData.diners.length} diners at the first one`);
    check('diners sit at the dining table, off the road',
        world.dhabas[0].userData.diners.every(diner =>
            diner.userData.isDiner && Math.abs(diner.position.x) > 0));

    // The signboards are drawn with Devanagari text; make sure it is rendered
    const signDraws = globalThis.__context2d.drawnText
        .filter(entry => typeof entry.text === 'string' && entry.text.includes('ढाबा'));
    check('dhaba signboards draw a Devanagari name', signDraws.length > 0,
        signDraws.length ? signDraws[0].text : 'none');
    check('dhaba sign text is drawn large and readable',
        signDraws.length > 0 && signDraws.every(entry => {
            const size = parseFloat((entry.font.match(/(\d+(?:\.\d+)?)px/) || [0, 0])[1]);
            return size >= 18;
        }),
        signDraws.length ? signDraws[0].font : 'none');

    // ---------------------------------------- feature: distance boards
    const signs = await import(pathToFileURL(join(tempDir, 'signs.js')).href);
    const boardNames = signs.distanceBoardNames();
    check('three named distance boards are configured', boardNames.length === 3, boardNames.join(', '));
    check('the boards name बौंली, सवाई माधोपुर and धौलपुर',
        boardNames.includes('बौंली') && boardNames.includes('सवाई माधोपुर') && boardNames.includes('धौलपुर'));
    check('distance boards exist in the world', world.boards.length === 3,
        `${world.boards.length} boards`);
    check('boards are placed beside the road',
        world.boards.every(board => Math.abs(board.position.x) > constants.ROAD_HALF_WIDTH),
        `nearest x=${Math.min(...world.boards.map(b => Math.abs(b.position.x))).toFixed(1)}`);
    check('boards stand upright facing the oncoming bus',
        world.boards.every(board => board.rotation.y === 0));

    // --------------------------------------------- feature: petrol pumps
    const petrol = await import(pathToFileURL(join(tempDir, 'petrolpump.js')).href);
    check('petrol pumps exist along the road', world.pumps.length >= 1,
        `${world.pumps.length} pumps`);
    check('petrol pumps are flagged and named',
        world.pumps.every(pump => pump.userData.isPetrolPump && pump.userData.stationName),
        world.pumps[0].userData.stationName);
    check('petrol pumps are built off the carriageway',
        world.pumps.every(pump =>
            Math.abs(pump.position.x) - pump.userData.width / 2 > constants.ROAD_HALF_WIDTH),
        `nearest forecourt edge x=${Math.min(...world.pumps.map(p =>
            Math.abs(p.position.x) - p.userData.width / 2)).toFixed(1)}`);
    check('each pump has working fuel dispensers',
        world.pumps.every(pump => pump.userData.dispensers.length >= 2));
    check('petrol pump signboards are painted with a readable name',
        petrol.petrolPumpNames().some(name =>
            globalThis.__context2d.drawnText.some(entry => entry.text === name)) &&
        globalThis.__context2d.drawnText
            .filter(entry => petrol.petrolPumpNames().includes(entry.text))
            .every(entry => parseFloat((entry.font.match(/(\d+(?:\.\d+)?)px/) || [0, 0])[1]) >= 24),
        petrol.petrolPumpNames().join(' / '));

    // ------------------------------------------------ feature: bus stand
    const stand = globalThis.__busStand;
    check('the bus starts at a bus stand', !!stand && stand.userData.isBusStand === true);
    check('the bus stand is right behind the starting position',
        Math.abs(stand.position.z - (constants.PLAYER_START_Z + 6)) < 1e-6,
        `stand z=${stand.position.z}, bus z=${constants.PLAYER_START_Z}`);
    check('the bus stand is beside the road, not on it',
        stand.userData.platformX < -constants.ROAD_HALF_WIDTH,
        `platform x=${stand.userData.platformX.toFixed(1)}`);
    check('the bus stand has waiting passengers',
        stand.userData.passengers.length >= 3,
        `${stand.userData.passengers.length} waiting`);
    check('the bus stand board shows its Devanagari name',
        stand.userData.signLines.includes('बस स्टैंड') &&
        globalThis.__context2d.drawnText.some(entry => entry.text === 'बस स्टैंड'),
        stand.userData.signLines.join(' / '));

    // ------------------------------------------------- feature: four lanes
    const laneOrder = [
        constants.LANE_LEFT_OUTER, constants.LANE_LEFT,
        constants.LANE_RIGHT, constants.LANE_RIGHT_OUTER
    ];
    check('the road has four lanes',
        laneOrder.every((x, i) => i === 0 || laneOrder[i - 1] < x),
        laneOrder.join(' | '));
    check('all four lanes fit inside the asphalt',
        Math.max(Math.abs(constants.LANE_LEFT_OUTER), Math.abs(constants.LANE_RIGHT_OUTER)) <
        constants.ROAD_HALF_WIDTH);
    check('the bus starts in one of the forward lanes',
        constants.LANES_FORWARD.includes(constants.LANE_LEFT),
        `forward lanes: ${constants.LANES_FORWARD.join(', ')}`);
    check('same-direction traffic uses the forward lanes only',
        cars.filter(car => !car.userData.isOncoming)
            .every(car => constants.LANES_FORWARD.includes(car.userData.laneX)));
    check('oncoming traffic uses the far lanes only',
        cars.filter(car => car.userData.isOncoming)
            .every(car => constants.LANES_ONCOMING.includes(car.userData.laneX)));
    check('the two directions are split by the centre line',
        constants.LANES_FORWARD.every(x => x < 0) &&
        constants.LANES_ONCOMING.every(x => x > 0));

    const boardDraws = globalThis.__context2d.drawnText;
    check('every town name is painted onto a board',
        boardNames.every(name => boardDraws.some(entry => entry.text === name)),
        boardNames.join(' / '));
    check('board names are drawn large enough to read from the road',
        boardNames.every(name => {
            const drawn = boardDraws.filter(entry => entry.text === name);
            return drawn.length > 0 && drawn.every(entry =>
                parseFloat((entry.font.match(/(\d+(?:\.\d+)?)px/) || [0, 0])[1]) >= 24);
        }),
        (boardDraws.find(entry => entry.text === 'सवाई माधोपुर') || {}).font || 'none');
    check('board distances are drawn as numbers',
        boardDraws.some(entry => entry.text === '12') &&
        boardDraws.some(entry => entry.text === '28') &&
        boardDraws.some(entry => entry.text === '46'));

    // ------------------------------------------------- feature: autopilot
    const autoButton = findNode('#auto-button');
    check('HUD exposes an AUTO button', !!autoButton);
    check('AUTO button starts in the "off" state',
        autoButton && autoButton.textContent === 'AUTO DRIVE', autoButton ? autoButton.textContent : 'missing');

    const autopilot = globalThis.__autopilot;
    check('autopilot controller was created', !!autopilot);
    check('autopilot starts disengaged', autopilot.isActive() === false);

    // Park the traffic far down the road so the AI driver is judged on its own
    // driving instead of on a car that happened to spawn on the bus.
    cars.forEach((car, i) => {
        const laneX = car.userData.isOncoming ? constants.LANE_RIGHT : constants.LANE_LEFT;
        car.position.set(laneX, 0, -2400 - i * 8);
        car.userData.speed = 0;
        car.userData.targetSpeed = 0;
        car.userData.laneX = laneX;
    });

    bus.position.set(constants.LANE_LEFT, 0, constants.PLAYER_START_Z);
    bus.rotation.y = 0;
    bus.userData.speed = 0;

    const autoStartZ = bus.position.z;
    autoButton.listeners.click.forEach(fn => fn({ preventDefault() {} }));
    check('clicking AUTO engages the autopilot', autopilot.isActive() === true);
    check('AUTO button shows the "on" state',
        autoButton.textContent.includes('AUTO ON'), autoButton.textContent);

    for (let i = 0; i < 120; i++) {
        time += 16.7;
        animate(time);
    }

    check('autopilot accelerates the bus without any key held',
        bus.position.z < autoStartZ - 20,
        `z ${autoStartZ.toFixed(1)} → ${bus.position.z.toFixed(1)}`);
    check('autopilot keeps the bus on the asphalt',
        Math.abs(bus.position.x) <= constants.ROAD_HALF_WIDTH - 0.5,
        `x=${bus.position.x.toFixed(2)}`);
    check('AUTO keeps running on the endless road',
        autopilot.isActive() === true, `reason=${autopilot.getState().reason}`);

    // Overtaking: a stopped car parked ahead in the bus's lane must make the
    // autopilot pull out and pass it.
    const overtakeCar = cars[0];
    overtakeCar.position.set(bus.position.x, 0, bus.position.z - 20);
    overtakeCar.userData.isOncoming = false;
    overtakeCar.userData.speed = 0;
    overtakeCar.userData.targetSpeed = 0;
    overtakeCar.userData.laneX = overtakeCar.position.x;
    // The stopped car stays put: it is the obstacle being passed
    overtakeCar.userData.laneCooldown = 1e9;
    // The passing lane must be empty for the manoeuvre to start
    cars.forEach(car => {
        if (car !== overtakeCar && car.position.x < 0) car.position.z = bus.position.z + 200;
    });

    const laneBefore = bus.position.x;
    const zBefore = bus.position.z;
    for (let i = 0; i < 90; i++) {
        time += 16.7;
        animate(time);
    }

    check('autopilot changes lanes to pass a slow vehicle',
        Math.abs(bus.position.x - laneBefore) > 0.5,
        `x ${laneBefore.toFixed(2)} → ${bus.position.x.toFixed(2)}`);
    check('autopilot keeps moving while overtaking',
        bus.position.z < zBefore - 5,
        `z ${zBefore.toFixed(1)} → ${bus.position.z.toFixed(1)}`);

    // Let the pass finish: the bus must get past the stopped car, slide back
    // into its own lane and do it without touching anything
    const impactsBeforePass = bus.userData.impacts;
    for (let i = 0; i < 480; i++) {
        time += 16.7;
        animate(time);
    }
    check('autopilot passes the stopped car',
        overtakeCar.position.z > bus.position.z,
        `car z ${overtakeCar.position.z.toFixed(1)}, bus z ${bus.position.z.toFixed(1)}`);
    check('autopilot returns to the inside lane after the pass',
        Math.abs(bus.position.x - constants.LANE_LEFT) < 0.5,
        `x=${bus.position.x.toFixed(2)}`);
    check('the overtake happens without a collision',
        bus.userData.impacts === impactsBeforePass,
        `impacts ${impactsBeforePass} → ${bus.userData.impacts}`);

    // Pressing a driving key hands control back to the player
    globalThis.__listeners.keydown.forEach(fn =>
        fn({ code: 'KeyW', target: { tagName: 'BODY' }, preventDefault() {} }));
    check('pressing a driving key cancels the autopilot', autopilot.isActive() === false);
    globalThis.__listeners.keyup.forEach(fn => fn({ code: 'KeyW' }));

    // ------------------------------------------------ feature: distance driven
    bus.position.set(constants.LANE_LEFT, 0, constants.PLAYER_START_Z);
    cars.forEach(car => { car.position.z = bus.position.z + 200; });
    bus.rotation.y = 0;
    bus.userData.speed = 0;

    press('KeyW');
    for (let i = 0; i < 900; i++) {
        time += 16.7;
        animate(time);
    }
    release('KeyW');

    const driven = world.travelledDistance();
    check('driving accumulates distance travelled',
        driven > 0, `${driven.toFixed(0)} m driven`);
    check('the road has no pot holes',
        world.getState().potholesEnabled === undefined && world.potholes === undefined);

    // ----------------------------------------------- feature: the endless road
    const roadBefore = world.segments.map(segment => segment.position.z);
    const zBeforeJump = bus.position.z;

    // Teleport far down the road: the world must follow the bus
    bus.position.z -= 2000;
    for (let i = 0; i < 5; i++) {
        time += 16.7;
        animate(time);
    }

    check('the bus keeps driving with no road end',
        bus.position.z < zBeforeJump - 1900,
        `z ${zBeforeJump.toFixed(0)} → ${bus.position.z.toFixed(0)}`);
    check('road segments were recycled to follow the bus',
        world.segments.some(segment => segment.position.z !== roadBefore[0]) &&
        world.segments.every(segment => Math.abs(segment.position.z - bus.position.z) < 1200),
        `nearest segment z=${Math.min(...world.segments.map(s => Math.abs(s.position.z - bus.position.z))).toFixed(0)} away`);
    check('road segments cover the road ahead of the bus',
        world.segments.filter(segment => segment.position.z < bus.position.z).length >= 4,
        `${world.segments.filter(s => s.position.z < bus.position.z).length} ahead`);
    check('the road really is endless: the bus was not stopped',
        bus.userData.speed >= 0 && !bus.userData.engineOff);
    check('scenery followed the bus too (dhabas / boards / trees)',
        [...world.dhabas, ...world.boards].every(item => Math.abs(item.position.z - bus.position.z) < 1400) &&
        world.trees.every(tree => Math.abs(tree.position.z - bus.position.z) < 900));

    // The ground and sky must travel with the bus, otherwise the land beside the
    // road turns black once the bus outruns the finite ground plane.
    const ground = scene.children.find(child =>
        child.material && child.material.map &&
        child.geometry && child.geometry.parameters &&
        child.geometry.parameters.width === 1200);
    const skyDome = globalThis.__skyDome;
    check('the grass ground exists', !!ground);
    check('the ground follows the bus down the endless road',
        ground && Math.abs(ground.position.z - bus.position.z) < 100,
        ground ? `ground z=${Math.round(ground.position.z)}, bus z=${Math.round(bus.position.z)}` : 'missing');
    check('the ground snaps to whole texture tiles (no grass sliding)',
        ground && Math.abs(ground.position.z % 6) < 1e-6,
        ground ? `z % 6 = ${(ground.position.z % 6).toFixed(3)}` : 'missing');
    check('the sky dome follows the bus too',
        !!skyDome && Math.abs(skyDome.position.z - bus.position.z) < 1e-6,
        skyDome ? `sky z=${Math.round(skyDome.position.z)}` : 'missing');

    // The sky must actually be DRAWN. The dome geometry is inverted with
    // scale(-1, 1, 1), so the material has to be FrontSide - adding BackSide on
    // top culled the entire dome and left a black band across the horizon.
    check('sky dome is not double-flipped (no black horizon)',
        skyDome && skyDome.material.side !== 1,
        skyDome ? `side=${skyDome.material.side}` : 'missing');
    check('sky dome is not frustum culled while it follows the camera',
        skyDome && skyDome.frustumCulled === false);
    check('sky dome is drawn behind everything',
        skyDome && skyDome.renderOrder < 0,
        skyDome ? `renderOrder=${skyDome.renderOrder}` : 'missing');

    // --------------------------------------------------- HUD trip meter
    const distanceEl = findNode('#distance');
    const nextTownEl = findNode('#next-town');
    check('HUD shows the distance driven',
        distanceEl && /DISTANCE: \d+\.\d KM/.test(distanceEl.textContent),
        distanceEl ? distanceEl.textContent : 'missing');
    check('HUD shows the next town from the boards',
        nextTownEl && nextTownEl.textContent.includes('NEXT:') &&
        boardNames.some(name => nextTownEl.textContent.includes(name)),
        nextTownEl ? nextTownEl.textContent : 'missing');


    // ------------------------------------------------ feature: touch pad
    const touch = await import(pathToFileURL(join(tempDir, 'touch.js')).href);
    check('touch devices are detected through matchMedia / maxTouchPoints',
        touch.isTouchDevice() === false, 'desktop stub reports no touch');

    // Pretend to be a phone and build the pad on a clean body
    globalThis.__listeners = globalThis.__listeners || {};
    globalThis.window.matchMedia = () => ({ matches: true, media: '(pointer: coarse)' });

    const { pad, buttons } = touch.createTouchControls(() => {});
    check('touch pad is created with four driving buttons',
        !!pad && buttons.left && buttons.right && buttons.forward && buttons.backward,
        `id=${pad.id}`);
    check('touch pad exposes pad-* buttons for tests',
        findNode('#pad-left') && findNode('#pad-forward') && findNode('#pad-backward'));

    const input = await import(pathToFileURL(join(tempDir, 'input.js')).href);
    const tap = (button, type) => button.listeners[type].forEach(fn => fn({ cancelable: false }));
    tap(buttons.forward, 'pointerdown');
    check('pressing the pad accelerates (key state set)',
        input.getKeys().forward === true);
    tap(buttons.forward, 'pointerup');
    check('releasing the pad stops accelerating',
        input.getKeys().forward === false);

    tap(buttons.left, 'pointerdown');
    check('pressing the pad steers', input.getKeys().left === true);
    tap(buttons.left, 'pointercancel');
    check('a cancelled touch releases the key', input.getKeys().left === false);

    input.releaseAllKeys();
    check('releaseAllKeys clears every direction',
        Object.entries(input.getKeys()).every(([key, v]) => key === 'steer' ? v === 0 : v === false));

    // Releases the driving keys through the same events the browser sends
    const releaseDrivingKeys = () => {
        ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(code =>
            globalThis.__listeners.keyup.forEach(fn => fn({ code })));
    };
    const frames = (count) => {
        for (let i = 0; i < count; i++) {
            time += 16.7;
            animate(time);
        }
    };

    // ------------------------------------- feature: traffic lane changes
    // A car stuck behind a slower car should move into the clear outside lane.
    // The two cars are kept clear of the bus's road-end recycling band.
    cars.forEach(car => {
        if (car !== cars[0] && car !== cars[2]) car.position.z = bus.position.z + 200;
    });
    cars[0].position.set(constants.LANE_LEFT, 0, bus.position.z - 150);
    cars[0].userData.laneX = constants.LANE_LEFT;
    cars[0].userData.speed = cars[0].userData.targetSpeed = 12;
    cars[2].position.set(constants.LANE_LEFT, 0, bus.position.z - 165);
    cars[2].userData.laneX = constants.LANE_LEFT;
    cars[2].userData.speed = cars[2].userData.targetSpeed = 2;
    cars.slice(0, 3).forEach(car => { car.userData.laneCooldown = 0; });
    frames(120);
    check('a car stuck behind a slower car changes to the free lane',
        cars[0].userData.laneX === constants.LANE_LEFT_OUTER &&
        Math.abs(cars[0].position.x - constants.LANE_LEFT_OUTER) < 0.5,
        `laneX=${cars[0].userData.laneX}, x=${cars[0].position.x.toFixed(2)}`);

    // ------------------------------------- feature: smooth bus steering
    releaseDrivingKeys();
    bus.position.x = constants.LANE_LEFT;
    bus.rotation.y = 0;
    bus.userData.speed = 15;
    bus.userData.steer = 0;
    globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyA', preventDefault() {} }));
    frames(1);
    const firstFrameSteer = bus.userData.steer;
    frames(60);
    check('steering builds up gradually, not in one frame',
        firstFrameSteer > 0 && firstFrameSteer < 0.05,
        `after one frame steer=${firstFrameSteer.toFixed(3)}`);
    check('a full left turn reaches full lock within a second',
        bus.userData.steer > 0.95, `steer=${bus.userData.steer.toFixed(2)}`);
    check('the bus yaws left while the wheel is turned',
        bus.rotation.y > 0.1, `yaw=${bus.rotation.y.toFixed(2)}`);
    releaseDrivingKeys();
    frames(60);
    check('the steering wheel returns to centre when released',
        Math.abs(bus.userData.steer) < 0.05, `steer=${bus.userData.steer.toFixed(3)}`);

    // ------------------------------------- feature: bus simulation
    // The bus is reset to its lane and reversed for the fuel check, so the
    // road distance is not changed by these tests
    const sim = globalThis.__busSim;
    // Traffic is taken out of the simulation for these checks, so no car can
    // hit the bus while it is teleported around; it is put back afterwards
    const parkedTraffic = globalThis.__aiCars.splice(0);

    // Checked first: later reverse driving can run into traffic and push the
    // safety score down before this check
    const safetyBeforeCrash = sim.getState().safety;
    bus.userData.impacts += 2;
    frames(1);
    check('a crash lowers the safety score',
        safetyBeforeCrash - sim.getState().safety >= 8,
        `safety ${safetyBeforeCrash} → ${sim.getState().safety}`);

    bus.position.x = constants.LANE_LEFT;
    bus.rotation.y = 0;
    bus.userData.speed = 0;
    globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyS', target: { tagName: 'BODY' }, preventDefault() {} }));
    const fuelBeforeDriving = sim.getState().fuelPercent;
    frames(1200);
    releaseDrivingKeys();
    check('the engine burns fuel while the bus moves',
        sim.getState().fuelPercent < fuelBeforeDriving,
        `fuel ${fuelBeforeDriving}% → ${sim.getState().fuelPercent}%`);

    const pump = globalThis.__world.pumps[0];
    bus.position.set(-4.5, 0, pump.position.z);
    bus.userData.speed = 0;
    const fuelAtPump = sim.getState().fuelPercent;
    frames(60);
    check('stopping at a petrol pump refuels the bus',
        sim.getState().fuelPercent > fuelAtPump,
        `fuel ${fuelAtPump}% → ${sim.getState().fuelPercent}%`);

    const stop = sim.stops[0];
    stop.userData.served = false;
    stop.userData.waiting = 5;
    const faresBeforeStop = sim.getState().fares;
    bus.position.set(-4.5, 0, stop.position.z);
    bus.userData.speed = 0;
    frames(1);
    check('the doors open for passengers at a kerb-side bus stop',
        sim.getState().doorsOpen === true && stop.userData.served === true);
    check('boarding passengers pay a fare',
        sim.getState().fares > faresBeforeStop,
        `fares ${faresBeforeStop} → ${sim.getState().fares}`);

    globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyW', target: { tagName: 'BODY' }, preventDefault() {} }));
    frames(120);
    check('the open doors hold the bus still',
        bus.userData.speed === 0, `speed=${bus.userData.speed.toFixed(2)}`);
    frames(240);
    releaseDrivingKeys();
    check('the doors close after the stop',
        sim.getState().doorsOpen === false);


    globalThis.__aiCars.push(...parkedTraffic);

    // ------------------------------- feature: mobile single-button layout
    const hudModule = await import(pathToFileURL(join(tempDir, 'hud.js')).href);
    const cameraModule = await import(pathToFileURL(join(tempDir, 'camera.js')).href);
    const hudEl = globalThis.__hud;

    // Start from the desktop layout, then switch to mobile and check the change
    hudModule.setHudMobileMode(hudEl, false);
    check('desktop HUD keeps the keyboard hints',
        hudEl.querySelector('#controls').style.display !== 'none');
    check('desktop HUD sits in the top-right corner',
        hudEl.style.top === '16px' && hudEl.style.right === '16px');
    check('desktop HUD is not reported as mobile',
        hudModule.isHudMobileLayout(hudEl) === false);

    hudModule.setHudMobileMode(hudEl, true);
    check('mobile HUD is a single bottom bar',
        hudEl.dataset.layout === 'mobile' && hudEl.style.bottom === '0',
        `layout=${hudEl.dataset.layout}, bottom=${hudEl.style.bottom}`);
    check('isHudMobileLayout reports the mobile layout',
        hudModule.isHudMobileLayout(hudEl) === true);
    check('mobile HUD hides the keyboard hints',
        hudEl.querySelector('#controls').style.display === 'none');
    check('mobile HUD keeps the AUTO button',
        !!hudEl.querySelector('#auto-button'));
    check('mobile AUTO button is big enough for a thumb',
        parseFloat(hudEl.querySelector('#auto-button').style.minHeight) >= 48,
        hudEl.querySelector('#auto-button').style.minHeight);

    // Only ONE tappable control should survive on mobile
    const mobileButtons = [];
    const walkButtons = (node) => {
        if (!node) return;
        if (node.tagName === 'BUTTON') mobileButtons.push(node);
        (node.children || []).forEach(walkButtons);
    };
    walkButtons(hudEl);
    check('mobile HUD exposes exactly one button (AUTO DRIVE)',
        mobileButtons.length === 1 && mobileButtons[0].id === 'auto-button',
        mobileButtons.map(b => b.id).join(', '));

    // The music panel buttons (a separate element) must be hidden as well, so
    // the ONLY control on a phone is AUTO DRIVE.
    const visibleMusicButtons = ['#music-prev', '#music-play', '#music-next']
        .map(selector => findNode(selector))
        .filter(button => button && button.style.display !== 'none');
    check('mobile hides the music panel buttons too',
        visibleMusicButtons.length === 0,
        visibleMusicButtons.map(b => b.id).join(', ') || 'all hidden');

    // The mobile music panel must not render any buttons either
    const mobileMusic = await import(pathToFileURL(join(tempDir, 'music.js')).href);
    const mobilePlayer = mobileMusic.createMusicPlayer({ playlist: ['song/A.mp3'] });
    const mobileUI = hudModule.createMusicUI(mobilePlayer, { showButtons: false });
    check('mobile music panel renders no buttons',
        !mobileUI.panel.querySelector('#music-play') &&
        !mobileUI.panel.querySelector('#music-next'),
        'button row removed');
    check('mobile music panel still shows the track title',
        mobileUI.title.textContent.startsWith('MUSIC:'), mobileUI.title.textContent);

    // ------------------------------------- feature: mobile camera zoom
    check('zoomForViewport pulls the camera back on a phone',
        cameraModule.zoomForViewport(390, 844) > 1,
        `portrait zoom=${cameraModule.zoomForViewport(390, 844)}`);
    check('zoomForViewport keeps the desktop framing on a wide screen',
        cameraModule.zoomForViewport(1920, 1080) === 1,
        `desktop zoom=${cameraModule.zoomForViewport(1920, 1080)}`);

    const zoomControl = cameraModule.createCameraController(
        globalThis.__camera, globalThis.__bus
    );
    zoomControl.setZoom(1.3);
    check('the camera controller accepts a zoom factor',
        Math.abs(zoomControl.getZoom() - 1.3) < 1e-6,
        `zoom=${zoomControl.getZoom()}`);
    zoomControl.setZoom(99);
    check('camera zoom is clamped to a sane range',
        zoomControl.getZoom() <= 2.5, `zoom=${zoomControl.getZoom()}`);

    rmSync(tempDir, { recursive: true, force: true });

    console.log('\n══════════════════════════════════════════');
    if (failures === 0) {
        console.log('✅ ALL SMOKE CHECKS PASSED');
        process.exit(0);
    }
    console.log(`❌ ${failures} SMOKE CHECK(S) FAILED`);
    process.exit(1);
}

main().catch(err => {
    console.error('❌ smoke test crashed:', err);
    process.exit(1);
});
