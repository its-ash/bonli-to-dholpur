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
    'constants.js', 'utils.js', 'rounded.js', 'environment.js', 'shops.js', 'signs.js',
    'petrolpump.js', 'busstand.js',
    'roadpath.js', 'junctions.js', 'audio.js',
    'biome_mountain.js', 'biome_desert.js', 'biome_coast.js', 'biomes.js',
    'endless.js', 'landscape.js', 'traffic_models.js', 'vehicles.js',
    'collision.js', 'input.js', 'camera.js', 'physics.js', 'journey.js',
    'autopilot.js', 'bussim.js', 'touch.js', 'pedestrians.js', 'hud.js', 'music.js', 'settings.js', 'main.js'
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
        this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
        this.scale = new Vector3(1, 1, 1);
        this.scale.setScalar = (s) => { this.scale.x = this.scale.y = this.scale.z = s; return this.scale; };
        this.children = [];
        this.userData = {};
        this.castShadow = false;
        this.receiveShadow = false;
        this.renderOrder = 0;
        this.visible = true;
        this.frustumCulled = true;
        this.matrix = {};
        const owner = this;
        this.quaternion = {};
        Object.defineProperty(this.quaternion, 'angle', { get: () => owner.rotation.y });
    }
    add(child) { this.children.push(child); return this; }
    lookAt() {}
    traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); else fn(c); }
    updateMatrixWorld() {}
    updateMatrix() {}
}

export { Object3D };
export class Group extends Object3D {}
export class Scene extends Object3D { constructor() { super(); this.fog = null; } }
export class Mesh extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
        super(geometry, material);
        this.count = count;
        this.instanceMatrix = { needsUpdate: false };
        this.instanceColor = null;
    }
    setMatrixAt() {}
    setColorAt() {}
}
export class Sprite extends Object3D {
    constructor(material) { super(); this.material = material; }
}
export class PerspectiveCamera extends Object3D {
    constructor(fov, aspect) { super(); this.fov = fov; this.aspect = aspect; }
    updateProjectionMatrix() {}
}
export class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; this.count = array.length / itemSize; }
    setXYZ(i, x, y, z) { this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z; return this; }
    setXY(i, x, y) { this.array[i * 2] = x; this.array[i * 2 + 1] = y; return this; }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
}
export class Float32BufferAttribute extends BufferAttribute {
    constructor(array, itemSize) { super(Array.isArray(array) ? new Float32Array(array) : array, itemSize); }
}
export class BufferGeometry {
    // A few placeholder vertices so shape-painting helpers have something to chew on
    constructor() { this.attributes = { position: new BufferAttribute(new Float32Array(24), 3), normal: new BufferAttribute(new Float32Array(24), 3) }; this.index = null; }
    toNonIndexed() { return this; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(list) { this.index = list; return this; }
    computeBoundingSphere() {}
    dispose() {}
}
// Shape-modifying helpers are no-ops in the stub: only sizes are inspected
Object.assign(BufferGeometry.prototype, {
    translate() { return this; }, rotateX() { return this; }, rotateY() { return this; },
    rotateZ() { return this; }, scale() { return this; }, computeVertexNormals() {}
});
export class BoxGeometry extends BufferGeometry { constructor(w, h, d) { super(); this.parameters = { width: w, height: h, depth: d }; } }
export class RoundedBoxGeometry extends BoxGeometry {}
export class CylinderGeometry extends BufferGeometry { constructor(r, r2, h) { super(); this.parameters = { radiusTop: r, radiusBottom: r2, height: h }; } }
export class PlaneGeometry extends BufferGeometry { constructor(w, h) { super(); this.parameters = { width: w, height: h }; } }
export class SphereGeometry extends BufferGeometry { constructor(r) { super(); this.parameters = { radius: r }; } }
export class ConeGeometry extends BufferGeometry { constructor(r, h) { super(); this.parameters = { radius: r, height: h }; } }
export class CircleGeometry extends BufferGeometry { constructor(r) { super(); this.parameters = { radius: r }; } }
export class IcosahedronGeometry extends BufferGeometry { constructor(r) { super(); this.parameters = { radius: r }; } }
for (const G of [BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, ConeGeometry, CircleGeometry, IcosahedronGeometry]) {
    for (const k of ['translate', 'rotateX', 'rotateY', 'rotateZ', 'scale']) {
        if (!G.prototype[k]) G.prototype[k] = function () { return this; };
    }
    if (!G.prototype.computeVertexNormals) G.prototype.computeVertexNormals = function () {};
}
export class Fog { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } }
export class Color {
    constructor(hex) { this.hex = hex; }
    set(hex) { this.hex = hex; return this; }
    setHex(hex) { this.hex = hex; return this; }
    getHex() { return this.hex; }
    copy(other) { this.hex = other.hex; return this; }
    clone() { return new Color(this.hex); }
    lerp() { return this; }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    setHSL() { return this; }
    add() { return this; }
    multiply() { return this; }
    multiplyScalar(s) { this.hex = this.hex * s; return this; }
}
export class CanvasTexture {
    constructor(canvas) { this.image = canvas; this.repeat = { set() {} }; this.offset = { x: 0, y: 0 }; }
    dispose() {}
}
class Material {
    constructor(opts = {}) {
        Object.assign(this, opts);
        if (typeof this.color === 'number') this.color = new Color(this.color);
    }
    dispose() {}
    clone() {
        const copy = new this.constructor({});
        Object.assign(copy, this);
        if (this.color && this.color.clone) copy.color = this.color.clone();
        return copy;
    }
}
export class MeshStandardMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class DataTexture extends CanvasTexture {
    constructor(data, w, h) { super(null); this.image = { data, width: w, height: h }; }
}
export class PointsMaterial extends Material {}
export class Points extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class ShaderMaterial extends Material {}
export const RGBAFormat = 1023;
export class TorusGeometry extends BufferGeometry { constructor(r, t) { super(); this.parameters = { radius: r, tube: t }; } }
for (const k of ['translate', 'rotateX', 'rotateY', 'rotateZ', 'scale']) {
    if (!TorusGeometry.prototype[k]) TorusGeometry.prototype[k] = function () { return this; };
}
if (!TorusGeometry.prototype.computeVertexNormals) TorusGeometry.prototype.computeVertexNormals = function () {};
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
            arc: noop,
            ellipse: noop,
            rect: noop,
            quadraticCurveTo: noop,
            bezierCurveTo: noop,
            arcTo: noop,
            rotate: noop,
            setTransform: noop,
            clip: noop,
            strokeRect: noop,
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
        const rewritten = source
            .replace(/from 'three'/g, "from './three-stub.mjs'")
            .replace(/from 'three\/addons\/[^']+'/g, "from './three-stub.mjs'");
        writeFileSync(join(tempDir, file), rewritten);
    }

    installBrowserStubs();

    const constants = await import(pathToFileURL(join(tempDir, 'constants.js')).href);
    // The road bends: tests think in lateral offsets from the centre line
    const roadpath = await import(pathToFileURL(join(tempDir, 'roadpath.js')).href);
    const roadPoint = roadpath.roadPoint;
    const roadLateral = (obj) => roadpath.lateralOffset(obj.position.x, obj.position.z);
    // Put something on the road at a lateral offset, facing along the road
    const placeOnRoad = (obj, lateral, z = obj.position.z) => {
        const p = roadpath.roadPoint(z, lateral);
        obj.position.x = p.x;
        obj.position.z = p.z;
        obj.rotation.y = p.heading;
    };

    // Importing main.js boots the whole game (scene, bus, traffic, loop).
    await import(pathToFileURL(join(tempDir, 'main.js')).href);

    check('game boots without runtime errors', true);

    // The game opens on the title screen; press START to begin the trip
    check('game opens in the ready state (title screen)', globalThis.__journey.status === 'ready');
    globalThis.__startGame();
    check('START begins the trip', globalThis.__journey.status === 'driving');

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
        Math.abs(roadLateral(bus) - constants.LANE_LEFT) < 0.05,
        `lateral=${roadLateral(bus).toFixed(2)}`);
    check('bus front (headlights) faces the driving direction (-Z)',
        Math.abs(bus.rotation.y - roadpath.roadHeading(bus.position.z)) < 1e-6);

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
    // 2.5 s: a heavy bus with a gearbox needs a moment to pull away
    for (let i = 0; i < 150; i++) {
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
        Math.abs(roadLateral(bus)) <= constants.ROAD_HALF_WIDTH,
        `lateral=${roadLateral(bus).toFixed(2)}`);

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

    // --- Sound settings: music and game sound, switch + volume each ---
    {
        const settings = globalThis.__soundSettings;
        const soundUI = globalThis.__soundUI;
        const gameAudio = globalThis.__audio;
        check('sound settings exist with music and game sound',
            !!settings && 'musicVolume' in settings.get() && 'sfxVolume' in settings.get());
        const find = (id) => globalThis.document.querySelector('#' + id);
        check('sound settings panel has both sliders and switches',
            !!find('music-volume') && !!find('sfx-volume') && !!find('music-toggle') && !!find('sfx-toggle'));
        check('title and pause screens have a SOUND button',
            !!find('title-sound-button') && !!find('pause-sound-button') && !!find('music-settings'));

        find('title-sound-button').listeners.click.forEach(fn => fn({ preventDefault() {} }));
        check('SOUND button opens the settings', soundUI.isOpen() && soundUI.overlay.style.display === 'flex');

        const musicSlider = find('music-volume');
        musicSlider.value = '20';
        musicSlider.listeners.input.forEach(fn => fn({}));
        check('music slider sets the music volume', Math.abs(audioEl.volume - 0.2) < 1e-6 && settings.get().musicVolume === 0.2,
            `volume=${audioEl.volume}`);

        const sfxSlider = find('sfx-volume');
        sfxSlider.value = '30';
        sfxSlider.listeners.input.forEach(fn => fn({}));
        check('game sound slider sets the engine volume', Math.abs(gameAudio.getVolume() - 0.3) < 1e-6);

        find('music-toggle').listeners.click.forEach(fn => fn({ preventDefault() {} }));
        check('music switch turns the music off (game sound stays on)',
            music.getState().isMuted === true && gameAudio.isMuted() === false &&
            find('music-toggle').textContent === 'OFF');
        find('sfx-toggle').listeners.click.forEach(fn => fn({ preventDefault() {} }));
        check('game sound switch mutes the engine', gameAudio.isMuted() === true);

        globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyM', target: { tagName: 'BODY' }, preventDefault() {} }));
        check('M turns all sound back on', music.getState().isMuted === false && gameAudio.isMuted() === false);
        globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyM', target: { tagName: 'BODY' }, preventDefault() {} }));
        check('M mutes music and game sound', music.getState().isMuted === true && gameAudio.isMuted() === true);

        find('sound-reset').listeners.click.forEach(fn => fn({ preventDefault() {} }));
        check('Reset restores the default sound settings',
            settings.get().musicOn && settings.get().sfxOn && Math.abs(audioEl.volume - constants.MUSIC_VOLUME) < 1e-6);

        globalThis.__listeners.keydown.forEach(fn => fn({ code: 'Escape', target: { tagName: 'BODY' }, preventDefault() {} }));
        check('Esc closes the sound settings', soundUI.isOpen() === false && soundUI.overlay.style.display === 'none');
        // Opening the settings mid-trip paused the game: resume it for the rest of the run
        const pauseScreen = find('pause-screen');
        if (pauseScreen && pauseScreen.style.display === 'flex') {
            find('resume-button').listeners.click.forEach(fn => fn({ preventDefault() {} }));
        }
        check('the trip resumes after closing the sound settings', globalThis.__game.paused === false);
    }

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
        /^music:/i.test(titleNode.textContent),
        titleNode.textContent);

    const counterNode = findNode('#track-counter');
    check('UI shows the track counter', /TRACK \d+ \/ \d+/i.test(counterNode.textContent), counterNode.textContent);

    // ------------------------------------- rear heart decal (कुकू संग चुनमुन)
    const findDeep = (root, test) => {
        for (const child of root.children || []) {
            if (test(child)) return child;
            const found = findDeep(child, test);
            if (found) return found;
        }
        return undefined;
    };
    const decal = findDeep(bus,
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
    check('the boards name लालसोट, दौसा and जयपुर',
        boardNames.includes('लालसोट') && boardNames.includes('दौसा') && boardNames.includes('जयपुर'));
    check('distance boards exist in the world', world.boards.length === 3,
        `${world.boards.length} boards`);
    check('boards are placed beside the road',
        world.boards.every(board => Math.abs(board.position.x) > constants.ROAD_HALF_WIDTH),
        `nearest x=${Math.min(...world.boards.map(b => Math.abs(b.position.x))).toFixed(1)}`);
    check('boards stand upright facing the oncoming bus',
        world.boards.every(board =>
            Math.abs(board.rotation.y - (board.userData.baseYaw + roadpath.roadHeading(board.position.z))) < 0.02));

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
        (boardDraws.find(entry => entry.text === 'दौसा') || {}).font || 'none');
    check('board distances are drawn as numbers',
        boardDraws.some(entry => entry.text === '62') &&
        boardDraws.some(entry => entry.text === '98') &&
        boardDraws.some(entry => entry.text === '150'));

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

    placeOnRoad(bus, constants.LANE_LEFT, constants.PLAYER_START_Z);
    bus.userData.speed = 0;

    const autoStartZ = bus.position.z;
    autoButton.listeners.click.forEach(fn => fn({ preventDefault() {} }));
    check('clicking AUTO engages the autopilot', autopilot.isActive() === true);
    check('AUTO button shows the "on" state',
        autoButton.textContent.includes('AUTO ON'), autoButton.textContent);

    // 5 s: the automatic gearbox pulls away like a heavy bus, not a sports car
    for (let i = 0; i < 300; i++) {
        time += 16.7;
        animate(time);
    }

    check('autopilot accelerates the bus without any key held',
        bus.position.z < autoStartZ - 20,
        `z ${autoStartZ.toFixed(1)} → ${bus.position.z.toFixed(1)} lat=${roadLateral(bus).toFixed(2)} yawErr=${(bus.rotation.y - roadpath.roadHeading(bus.position.z)).toFixed(2)} speed=${bus.userData.speed.toFixed(1)} mode=${JSON.stringify(autopilot.getState())}`);
    check('autopilot keeps the bus on the asphalt',
        Math.abs(roadLateral(bus)) <= constants.ROAD_HALF_WIDTH - 0.5,
        `lateral=${roadLateral(bus).toFixed(2)}`);
    check('AUTO keeps running on the endless road',
        autopilot.isActive() === true, `reason=${autopilot.getState().reason}`);

    // Overtaking: a stopped car parked ahead in the bus's lane must make the
    // autopilot pull out and pass it.
    const overtakeCar = cars[0];
    overtakeCar.position.y = 0;
    // Just inside the autopilot's look-ahead (34 m), as if it came into view
    placeOnRoad(overtakeCar, roadLateral(bus), bus.position.z - 32);
    overtakeCar.userData.isOncoming = false;
    overtakeCar.userData.speed = 0;
    overtakeCar.userData.targetSpeed = 0;
    overtakeCar.userData.laneX = roadLateral(overtakeCar);
    // The stopped car stays put: it is the obstacle being passed
    overtakeCar.userData.laneCooldown = 1e9;
    // The passing lane must be empty for the manoeuvre to start
    cars.forEach(car => {
        if (car === overtakeCar) return;
        // Park every other car well behind the bus so the pass is not random
        car.position.z = bus.position.z + 800;
        car.userData.speed = 0;
        car.userData.targetSpeed = 0;
        car.userData.laneCooldown = 1e9;
    });

    const laneBefore = roadLateral(bus);
    const zBefore = bus.position.z;
    for (let i = 0; i < 90; i++) {
        time += 16.7;
        animate(time);
    }

    check('autopilot changes lanes to pass a slow vehicle',
        Math.abs(roadLateral(bus) - laneBefore) > 0.5,
        `lateral ${laneBefore.toFixed(2)} → ${roadLateral(bus).toFixed(2)}`);
    check('autopilot keeps moving while overtaking',
        bus.position.z < zBefore - 5,
        `z ${zBefore.toFixed(1)} → ${bus.position.z.toFixed(1)}`);

    // Let the pass finish: the bus must get past the stopped car, slide back
    // into its own lane and do it without touching anything
    const impactsBeforePass = bus.userData.impacts;
    // Recorded during the run: once far behind, traffic is respawned ahead of the bus
    let passedStoppedCar = false;
    let backInLane = false;
    for (let i = 0; i < 720; i++) {
        time += 16.7;
        animate(time);
        if (overtakeCar.position.z > bus.position.z + 5) passedStoppedCar = true;
        if (passedStoppedCar && Math.abs(roadLateral(bus) - constants.LANE_LEFT) < 0.5) {
            backInLane = true;
            break;
        }
    }
    check('autopilot passes the stopped car', passedStoppedCar,
        `car z ${overtakeCar.position.z.toFixed(1)}, bus z ${bus.position.z.toFixed(1)} lat=${roadLateral(bus).toFixed(2)} carLat=${roadLateral(overtakeCar).toFixed(2)} speed=${bus.userData.speed.toFixed(1)} ap=${JSON.stringify(autopilot.getState())} near=${JSON.stringify(globalThis.__aiCars.filter(c => Math.abs(c.position.z - bus.position.z) < 40).map(c => [c.userData.type || c.name, +roadLateral(c).toFixed(1), +(c.position.z - bus.position.z).toFixed(1), !!c.userData.isOncoming]))}`);
    // Closing in on a stop or pump the autopilot deliberately keeps to the kerb-side lane
    const nearStopAhead = [...globalThis.__busSim.stops, ...world.pumps].some(s =>
        bus.position.z - s.position.z > -20 && bus.position.z - s.position.z < 170);
    check('autopilot returns to the inside lane after the pass',
        backInLane || (nearStopAhead && Math.abs(roadLateral(bus) - constants.LANE_LEFT_OUTER) < 0.5),
        `lateral=${roadLateral(bus).toFixed(2)}`);
    check('the overtake happens without a collision',
        bus.userData.impacts === impactsBeforePass,
        `impacts ${impactsBeforePass} → ${bus.userData.impacts} last=${JSON.stringify(bus.userData.lastImpact)} busYawErr=${(bus.rotation.y - roadpath.roadHeading(bus.position.z)).toFixed(2)}`);

    // Pressing a driving key hands control back to the player
    globalThis.__listeners.keydown.forEach(fn =>
        fn({ code: 'KeyW', target: { tagName: 'BODY' }, preventDefault() {} }));
    check('pressing a driving key cancels the autopilot', autopilot.isActive() === false);
    globalThis.__listeners.keyup.forEach(fn => fn({ code: 'KeyW' }));

    // ------------------------------------------------ feature: distance driven
    placeOnRoad(bus, constants.LANE_LEFT, constants.PLAYER_START_Z);
    cars.forEach(car => { car.position.z = bus.position.z + 200; });
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

    // ------------------------------------------- feature: the road bends
    {
        let minX = 0, maxX = 0, maxHeading = 0, minRadius = Infinity;
        for (let z = constants.PLAYER_START_Z; z > -9000; z -= 5) {
            const x = roadpath.roadCenterX(z);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            maxHeading = Math.max(maxHeading, Math.abs(roadpath.roadHeading(z)));
            const k = Math.abs(roadpath.roadHeading(z + 2) - roadpath.roadHeading(z - 2)) / 4;
            if (k > 1e-6) minRadius = Math.min(minRadius, 1 / k);
        }
        check('the road bends both left and right', minX < -15 && maxX > 15,
            `x from ${minX.toFixed(0)} to ${maxX.toFixed(0)}`);
        check('bends are drivable for a 10 m bus (radius >= 100, heading <= 40deg)',
            minRadius >= 100 && maxHeading < 0.7,
            `min radius ${minRadius.toFixed(0)} m, max heading ${(maxHeading * 57.3).toFixed(0)} deg`);
    }
    {
        // Every road segment is a ribbon that follows the centre line, and
        // neighbouring segments join without a gap
        const half = constants.ROAD_HALF_WIDTH + constants.SHOULDER_WIDTH;
        const rows = (seg) => seg.geometry.attributes.position;
        const sorted = [...world.segments].sort((a, b) => b.position.z - a.position.z);
        let worstEdge = 0, worstJoin = 0;
        sorted.forEach((seg, i) => {
            const p = rows(seg);
            const nearZ = seg.position.z + constants.SEGMENT_LENGTH / 2;
            const l = roadPoint(nearZ, -half);
            worstEdge = Math.max(worstEdge, Math.abs(p.array[0] - l.x), Math.abs(p.array[2] + seg.position.z - l.z));
            if (i > 0) {
                const prev = rows(sorted[i - 1]);
                const last = prev.count - 2;
                worstJoin = Math.max(worstJoin,
                    Math.abs(prev.array[last * 3] - p.array[0]),
                    Math.abs(prev.array[last * 3 + 2] + sorted[i - 1].position.z - (p.array[2] + seg.position.z)));
            }
        });
        check('road segments are curved ribbons that follow the centre line', worstEdge < 0.01,
            `worst edge error ${worstEdge.toFixed(4)}`);
        check('road segments join end to end on the bends', worstJoin < 0.05,
            `worst gap ${worstJoin.toFixed(4)}`);
        const vs = sorted.map(s => s.geometry.attributes.uv.array);
        let worstV = 0;
        for (let i = 1; i < vs.length; i++) {
            const prev = vs[i - 1];
            worstV = Math.max(worstV, Math.abs(prev[prev.length - 1] - vs[i][1]));
        }
        check('lane-marking texture runs continuously along the arc', worstV < 1e-6,
            `v jump ${worstV.toExponential(1)}`);
    }

    // Scenery stands beside the road, not at a fixed world x
    {
        const stuff = [...world.dhabas, ...world.pumps, ...world.boards];
        const off = stuff.map(o => Math.abs(roadLateral(o)));
        check('dhabas, pumps and boards sit clear of the carriageway on the bends',
            off.every(v => v > constants.ROAD_HALF_WIDTH + 2),
            `nearest lateral ${Math.min(...off).toFixed(1)} m`);
        check('road has reflector posts on both edges',
            world.posts.some(p => roadLateral(p) < 0) && world.posts.some(p => roadLateral(p) > 0));
        check('bus shelters sit on the kerb side, square to the road',
            globalThis.__busSim.stops.every(s =>
                Math.abs(roadLateral(s) - constants.BUS_SIM.STOP_X) < 0.5 &&
                Math.abs(s.rotation.y - roadpath.roadHeading(s.position.z)) < 0.05));
    }

    // Autopilot: drive a long way through the bends and reach the first town stop
    {
        const busSim = globalThis.__busSim;
        const parkTraffic = () => cars.forEach((car, i) => {
            const laneX = car.userData.isOncoming ? constants.LANE_RIGHT : constants.LANE_LEFT;
            const at = roadPoint(bus.position.z + 400 + i * 10, laneX);
            car.position.set(at.x, 0, at.z);
            car.userData.speed = 0;
            car.userData.targetSpeed = 0;
        });
        parkTraffic();
        const spawn = roadPoint(constants.PLAYER_START_Z, constants.LANE_LEFT);
        bus.position.set(spawn.x, 0, spawn.z);
        bus.rotation.y = spawn.heading;
        bus.userData.speed = 0;
        bus.userData.doorsOpen = false;
        bus.userData.noFuel = false;
        autopilot.engage();

        const firstTown = busSim.stops.find(s => s.userData.stopKind === 'town');
        let maxLateral = 0, frames = 0, lastZ = bus.position.z, moved = 0;
        while (frames < 16000 && !firstTown.userData.served && autopilot.isActive()) {
            parkTraffic();
            time += 16.7;
            animate(time);
            frames++;
            maxLateral = Math.max(maxLateral, Math.abs(roadLateral(bus)));
            if (bus.userData.fuel !== undefined) bus.userData.fuel = 1;
        }
        check('autopilot stays on the road through the bends',
            maxLateral <= constants.ROAD_HALF_WIDTH,
            `max lateral ${maxLateral.toFixed(2)} m over ${(constants.PLAYER_START_Z - bus.position.z).toFixed(0)} m`);
        check('autopilot drove a long way (bus bent with the road)',
            bus.position.z < constants.PLAYER_START_Z - 1500 &&
            Math.abs(bus.position.x - roadpath.roadCenterX(bus.position.z)) < constants.ROAD_HALF_WIDTH,
            `z=${bus.position.z.toFixed(0)}, ${frames} frames`);
        check('the first town stop is reachable by following the road',
            firstTown.userData.served === true,
            `served=${firstTown.userData.served}, frames=${frames}, active=${autopilot.isActive()}, speed=${bus.userData.speed.toFixed(1)}, sig=${JSON.stringify(globalThis.__junctions?.signalAhead(bus.position.z - 5)?.state)}, lateral=${roadLateral(bus).toFixed(1)}, z gap=${(bus.position.z - firstTown.position.z).toFixed(1)}`);
        autopilot.disengage('test over');
        bus.userData.doorsOpen = false;
    }

    // Edge walls: running into the wall on a bend scrapes along it and the
    // bus can always reverse away again
    for (const wallZ of [-520, -1400, -3700]) {
        for (const side of [-1, 1]) {
            cars.forEach(car => { car.position.z = wallZ + 3000; });
            const at = roadPoint(wallZ, side * (constants.ROAD_HALF_WIDTH + constants.SHOULDER_WIDTH));
            bus.position.set(at.x, 0, at.z);
            // Pointing 35 degrees out through the wall
            bus.rotation.y = roadpath.roadHeading(wallZ) - side * 0.6;
            bus.userData.speed = 8;
            bus.userData.doorsOpen = false;
            press('KeyW');
            let worst = 0;
            for (let i = 0; i < 90; i++) {
                time += 16.7;
                animate(time);
                worst = Math.max(worst, Math.abs(roadLateral(bus)));
            }
            release('KeyW');
            check(`edge wall holds the bus on the bend (z=${wallZ}, side ${side})`,
                worst < constants.ROAD_HALF_WIDTH + constants.SHOULDER_WIDTH + 0.3, `worst lateral ${worst.toFixed(2)}`);

            // Now reverse hard: the bus must come away from the wall, not stick
            bus.userData.speed = 0;
            const before = roadLateral(bus);
            press('KeyS');
            for (let i = 0; i < 240; i++) {
                time += 16.7;
                animate(time);
            }
            release('KeyS');
            const after = roadLateral(bus);
            check(`reverse works against the wall (z=${wallZ}, side ${side})`,
                Math.abs(after) < Math.abs(before) - 0.3 || bus.userData.speed < -0.5 ||
                Math.hypot(bus.position.x - at.x, bus.position.z - at.z) > 3,
                `lateral ${before.toFixed(2)} -> ${after.toFixed(2)}, speed ${bus.userData.speed.toFixed(1)}`);
        }
    }
    bus.userData.speed = 0;

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
        distanceEl && /Left: \d+\.\d km of \d+/.test(distanceEl.textContent),
        distanceEl ? distanceEl.textContent : 'missing');
    check('HUD shows the next town from the boards',
        nextTownEl && nextTownEl.textContent.includes('Next:') &&
        constants.ROUTE.STOPS.some(stop => nextTownEl.textContent.includes(stop.name)),
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

    // Two thumbs: lifting the steering finger must not drop the accelerator
    tap(buttons.forward, 'pointerdown');
    tap(buttons.right, 'pointerdown');
    tap(buttons.right, 'pointerup');
    (globalThis.__listeners.pointerup || []).forEach(fn => fn({}));
    check('lifting one finger keeps the other pedal held (multi-touch)',
        input.getKeys().forward === true && input.getKeys().right === false,
        `forward=${input.getKeys().forward}, right=${input.getKeys().right}`);
    tap(buttons.forward, 'pointerup');

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

    // ------------------------------------- feature: landscape
    const land = globalThis.__landscape;
    const landscapeModule = await import(pathToFileURL(join(tempDir, 'landscape.js')).href);
    const landState = land.getState();
    check('the landscape has forests, ponds, lakes and mountains',
        landState.forests > 0 && landState.ponds > 0 && landState.lakes > 0 && landState.mountainRanges > 0,
        JSON.stringify(landState));

    const treesInWater = () => {
        const water = land.waterEllipses();
        return land.forests.reduce((n, patch) => n + patch.userData.trees.filter(t =>
            !t.hidden && landscapeModule.isInWater(patch.position.x + t.x, patch.position.z + t.z, water)).length, 0);
    };
    const nearestShore = Math.min(...land.waterEllipses().map(e =>
        Math.abs(e.x - roadpath.roadCenterX(e.z)) - e.rx - constants.LANDSCAPE.SHORE_WIDTH));
    check('ponds and lakes stay clear of the road and roadside buildings',
        nearestShore > constants.ROAD_HALF_WIDTH + 16, `nearest shore |x|=${nearestShore.toFixed(1)}`);
    check('mountains stand far from the road',
        land.mountains.every(range =>
            Math.abs(range.position.x - roadpath.roadCenterX(range.position.z)) >= constants.LANDSCAPE.MOUNTAIN.X_MIN));
    check('forests have visible trees', landState.visibleTrees > 0, `${landState.visibleTrees} trees`);
    check('no tree stands in a pond or lake', treesInWater() === 0, `${treesInWater()} trees in water`);

    // A long jump down the road: everything must be recycled around the bus
    bus.position.z -= 1500;
    frames(10);
    const forestsNearBus = land.forests.filter(patch => Math.abs(patch.position.z - bus.position.z) < 600).length;
    const rangesNearBus = land.mountains.filter(range => Math.abs(range.position.z - bus.position.z) < 900).length;
    check('forests and mountains follow the bus down the road',
        forestsNearBus > 0 && rangesNearBus > 0, `${forestsNearBus} forests, ${rangesNearBus} ranges nearby`);
    check('no tree stands in water after the landscape is recycled', treesInWater() === 0,
        `${treesInWater()} trees in water`);

    // ------------------------------------- feature: rounded vehicles and buildings
    const sharpBoxes = (root) => {
        let count = 0;
        const walk = (node) => {
            if (node.geometry && node.geometry.constructor.name === 'BoxGeometry') count += 1;
            (node.children || []).forEach(walk);
        };
        walk(root);
        return count;
    };
    const roundedTargets = [bus, ...globalThis.__aiCars, ...world.dhabas, ...world.pumps, globalThis.__busStand, ...globalThis.__busSim.stops];
    const sharp = roundedTargets.reduce((n, item) => n + sharpBoxes(item), 0);
    check('cars, the bus and the buildings use rounded boxes', sharp === 0,
        `${sharp} sharp boxes left (${roundedTargets.map((t, i) => i + ':' + sharpBoxes(t)).filter(s => !s.endsWith(':0')).join(' ')}; ai cars ${globalThis.__aiCars.length}, bus idx 0)`);
    const carRoof = globalThis.__aiCars[0].children[1];
    check('rounded boxes keep their real size for placement',
        carRoof.geometry.parameters.height > 0.3 && carRoof.geometry.parameters.height < 1,
        `car roof height ${carRoof.geometry.parameters.height.toFixed(2)}`);

    // ------------------------------------- feature: traffic lane changes
    // A car stuck behind a slower car should move into the clear outside lane.
    // The two cars are kept clear of the bus's road-end recycling band.
    cars.forEach(car => {
        if (car !== cars[0] && car !== cars[2]) car.position.z = bus.position.z + 200;
    });
    cars[0].position.y = 0;
    cars[2].position.y = 0;
    placeOnRoad(cars[0], constants.LANE_LEFT, bus.position.z - 150);
    cars[0].userData.laneX = constants.LANE_LEFT;
    cars[0].userData.speed = cars[0].userData.targetSpeed = 12;
    placeOnRoad(cars[2], constants.LANE_LEFT, bus.position.z - 165);
    cars[2].userData.laneX = constants.LANE_LEFT;
    cars[2].userData.speed = cars[2].userData.targetSpeed = 2;
    cars.slice(0, 3).forEach(car => { car.userData.laneCooldown = 0; });
    // Up to 4 s: the car may first brake to a stop behind the slow one
    for (let i = 0; i < 8; i++) {
        frames(30);
        if (cars[0].userData.laneX === constants.LANE_LEFT_OUTER &&
            Math.abs(roadLateral(cars[0]) - constants.LANE_LEFT_OUTER) < 0.5) break;
    }
    check('a car stuck behind a slower car changes to the free lane',
        cars[0].userData.laneX === constants.LANE_LEFT_OUTER &&
        Math.abs(roadLateral(cars[0]) - constants.LANE_LEFT_OUTER) < 0.5,
        `laneX=${cars[0].userData.laneX}, lateral=${roadLateral(cars[0]).toFixed(2)} lat=${cars[0].userData.lat?.toFixed(2)} speed=${cars[0].userData.speed.toFixed(1)} slow car: lateral=${roadLateral(cars[2]).toFixed(2)} dz=${(cars[2].position.z - cars[0].position.z).toFixed(1)}`);

    // ------------------------------------- regression: a crash must not pin the bus
    // Only one car on the road, just ahead in the bus's lane; the bus drives into it
    {
        const otherTraffic = globalThis.__aiCars.splice(1);
        const target = globalThis.__aiCars[0];
        releaseDrivingKeys();
        placeOnRoad(bus, constants.LANE_LEFT);
        bus.userData.speed = 20;
        target.position.y = 0;
        placeOnRoad(target, constants.LANE_LEFT, bus.position.z - 8);
        target.userData.isOncoming = false;
        target.userData.laneX = constants.LANE_LEFT;
        target.userData.speed = target.userData.targetSpeed = 12;
        target.userData.laneCooldown = 1e9;
        target.userData.touchingBus = false;
        const impactsBefore = bus.userData.impacts;
        const zBeforeCrash = bus.position.z;

        globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyW', target: { tagName: 'BODY' }, preventDefault() {} }));
        frames(180);
        releaseDrivingKeys();

        // Throttle is held throughout, so the bus rams the slower car a few separate
        // times; counting every frame of contact would give dozens
        check('each crash counts once, not on every frame of contact',
            bus.userData.impacts - impactsBefore >= 1 && bus.userData.impacts - impactsBefore <= 6,
            `${bus.userData.impacts - impactsBefore} crashes in 3 s`);
        // A pinned bus barely moves; a free one covers well over 20 m in 3 s
        check('the bus keeps driving after hitting a car',
            zBeforeCrash - bus.position.z > 20, `${(zBeforeCrash - bus.position.z).toFixed(1)} m in 3 s`);
        check('a car hit from behind is shoved forward and drives on',
            target.position.z < bus.position.z && target.userData.speed > 5,
            `car speed ${target.userData.speed.toFixed(1)} u/s`);

        target.userData.laneCooldown = 0;
        globalThis.__aiCars.push(...otherTraffic);
    }

    // ------------------------------------- feature: smooth bus steering
    releaseDrivingKeys();
    placeOnRoad(bus, constants.LANE_LEFT);
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

    placeOnRoad(bus, constants.LANE_LEFT);
    bus.userData.speed = 0;
    globalThis.__listeners.keydown.forEach(fn => fn({ code: 'KeyS', target: { tagName: 'BODY' }, preventDefault() {} }));
    const fuelBeforeDriving = sim.getState().fuelPercent;
    frames(1200);
    releaseDrivingKeys();
    check('the engine burns fuel while the bus moves',
        sim.getState().fuelPercent < fuelBeforeDriving,
        `fuel ${fuelBeforeDriving}% → ${sim.getState().fuelPercent}%`);

    const pump = globalThis.__world.pumps[0];
    placeOnRoad(bus, -4.5, pump.position.z);
    bus.userData.speed = 0;
    const fuelAtPump = sim.getState().fuelPercent;
    frames(60);
    check('stopping at a petrol pump refuels the bus',
        sim.getState().fuelPercent > fuelAtPump,
        `fuel ${fuelAtPump}% → ${sim.getState().fuelPercent}%`);

    // A stop can sit beside the pump, so let any open doors close first
    for (let i = 0; i < 600 && sim.getState().doorsOpen; i++) frames(1);
    const stop = sim.stops[0];
    stop.userData.served = false;
    stop.userData.waiting = 5;
    const faresBeforeStop = sim.getState().fares;
    placeOnRoad(bus, -4.5, stop.position.z);
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
        hudEl.style.top === '66px' && hudEl.style.right === '12px');
    check('desktop HUD is not reported as mobile',
        hudModule.isHudMobileLayout(hudEl) === false);

    hudModule.setHudMobileMode(hudEl, true);
    check('mobile HUD is a compact top-left card (bottom left free for the pad)',
        hudEl.dataset.layout === 'mobile' && hudEl.style.bottom === '' && /calc/.test(hudEl.style.top) &&
        /safe-area-inset-left/.test(hudEl.style.left),
        `layout=${hudEl.dataset.layout}, top=${hudEl.style.top}, bottom=${hudEl.style.bottom}`);
    check('mobile HUD hides the speed line (the dashboard shows it)',
        hudEl.querySelector('#speed').style.display === 'none');
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
        /^music:/i.test(mobileUI.title.textContent), mobileUI.title.textContent);

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

    // ------------------------------------- feature: biome zones
    {
        const { BIOMES, BIOME_CROSSFADE, ROUTE } = constants;
        const biomeLib = await import(pathToFileURL(join(tempDir, 'biomes.js')).href);
        const mgr = globalThis.__biomes;
        check('biome manager exists with update/getState/registerBiome',
            !!mgr && typeof mgr.update === 'function' && typeof mgr.getState === 'function' &&
            typeof mgr.registerBiome === 'function');
        let contiguous = BIOMES[0].start === 0 && BIOMES[BIOMES.length - 1].end === ROUTE.LENGTH;
        for (let i = 1; i < BIOMES.length; i++) contiguous = contiguous && BIOMES[i].start === BIOMES[i - 1].end;
        check('zones cover the whole route with no gaps', contiguous, `${BIOMES.length} zones`);
        check('all four biome kinds appear on the route',
            ['farmland', 'mountain', 'desert', 'coast'].every(id => BIOMES.some(z => z.id === id)));
        check('every zone has Hindi + English names and a palette',
            BIOMES.every(z => z.name && z.en && z.palette && typeof z.palette.ground === 'number' &&
                typeof z.palette.fog === 'number'));

        // The bus is driven back and forth along the route; the manager follows journey.distance
        const j = globalThis.__journey;
        const kmToDist = (km) => (km / ROUTE.TOTAL_KM) * ROUTE.LENGTH;
        const expectAt = { 5: 'farmland', 40: 'mountain', 75: 'desert', 105: 'coast', 135: 'farmland' };
        let allRight = true;
        const seen = [];
        for (const [km, id] of Object.entries(expectAt)) {
            const got = biomeLib.computeBiomeState(kmToDist(Number(km)));
            if (got.zone.id !== id) allRight = false;
            seen.push(`${km}km=${got.zone.id}`);
        }
        check('zone lookup reports the right biome at several distances', allRight, seen.join(' '));

        // Towns sit in sensible zones
        const stopZone = (id) => biomeLib.computeBiomeState(kmToDist(ROUTE.STOPS.find(s => s.id === id).km)).zone.id;
        check('Malarna Dungar is in the hills and Lalsot in the desert',
            stopZone('malarna') === 'mountain' && stopZone('lalsot') === 'desert');

        // Crossfade: weights always sum to ~1 and the window is BIOME_CROSSFADE wide
        let sumsOk = true;
        let blended = 0;
        for (let d = 0; d <= ROUTE.LENGTH; d += 25) {
            const w = biomeLib.computeBiomeState(d).weights;
            const total = w.farmland + w.mountain + w.desert + w.coast;
            if (Math.abs(total - 1) > 1e-9) sumsOk = false;
            if (Math.max(w.farmland, w.mountain, w.desert, w.coast) < 0.999) blended++;
        }
        check('crossfade weights sum to 1 along the whole route', sumsOk);
        const edge = BIOMES[1].start;
        const mid = biomeLib.computeBiomeState(edge).weights;
        const before = biomeLib.computeBiomeState(edge - BIOME_CROSSFADE).weights;
        const after = biomeLib.computeBiomeState(edge + BIOME_CROSSFADE).weights;
        check('weights are 50/50 on a boundary and pure well outside the window',
            Math.abs(mid.farmland - 0.5) < 1e-6 && Math.abs(mid.mountain - 0.5) < 1e-6 &&
            before.farmland === 1 && after.mountain === 1, `blended samples=${blended}`);

        // The live manager reacts to the journey distance
        mgr.update(0.016);
        const live = mgr.getState();
        const expectLive = biomeLib.computeBiomeState(j.distance).zone.id;
        check('manager state follows journey distance: id, name, next, blend',
            live.id === expectLive && typeof live.name === 'string' && 'next' in live && typeof live.blend === 'number',
            `${live.id} next=${live.next} blend=${live.blend.toFixed(2)}`);
        const lw = live.weights;
        check('live crossfade weights sum to 1', Math.abs(lw.farmland + lw.mountain + lw.desert + lw.coast - 1) < 1e-9);
    }

    // ------------------------------------- feature: full trip flow
    {
        const j = globalThis.__journey;
        const state = j.getState();
        check('route has a progress state with towns and stops',
            state.totalLength === constants.ROUTE.LENGTH && state.stops.length === constants.ROUTE.STOPS.length &&
            !!state.nextTown, `${state.stops.length} stops`);
        check('route ends at Jaipur Sindhi Camp',
            constants.ROUTE.END_NAME === 'जयपुर' && /Sindhi Camp/.test(constants.ROUTE.END_STAND_EN));
        check('a village cluster stands at each village stop',
            globalThis.__villages.length === constants.ROUTE.STOPS.filter(s => s.kind === 'village').length);
        // Drive the last stretch: arrive at the end of the route in small steps
        const b = globalThis.__bus;
        const frame = globalThis.__frames[0];
        let t = 1e6;
        for (let i = 0; i < 400 && j.status !== 'arrived' && j.status !== 'game_over'; i++) {
            b.position.z -= 40;
            b.userData.speed = 10;
            t += 16.7;
            frame(t);
            if (j.distance > constants.ROUTE.LENGTH - 10) break;
        }
        // Pull up at the end of the route
        // (the last village stop's dwell may still be running: let it finish)
        for (let i = 0; i < 1200 && (j.status === 'driving' || j.status === 'at_stop'); i++) {
            b.userData.speed = 0;
            t += 16.7;
            frame(t);
        }
        check('trip ends once the route end is reached',
            j.status === 'arrived' || j.status === 'game_over', `status=${j.status} dist=${j.distance.toFixed(0)} z=${b.position.z.toFixed(0)} paused=${globalThis.__game.paused}`);
        const summary = j.getSummary(globalThis.__busSim.getState());
        check('end summary has score, stars and times',
            typeof summary.score === 'number' && summary.stars >= 0 && summary.stars <= 3 && typeof summary.time === 'number');
    }

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
