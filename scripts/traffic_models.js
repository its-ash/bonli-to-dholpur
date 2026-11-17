// =============================================
// TRAFFIC MODELS - soft pastel low-poly Indian road vehicles
// Cars (7 body styles), auto-rickshaw, motorbike, bicycle, truck, tractor.
// Every builder fills a Group (facing -Z) and returns the userData fields the
// traffic AI needs (length / width for collisions, wheels, ...). Geometry and
// materials are cached, so rebuilding a vehicle on recycle costs nothing.
// =============================================

import * as THREE from 'three';
import { TRAFFIC_TYPES, COLORS } from './constants.js';
import { roundedBox, setRGB } from './rounded.js';

// ---------------------------------------------------------------- caches
const geoCache = new Map();
const matCache = new Map();

function rb(w, h, d, r) {
    const key = `rb${w}|${h}|${d}|${r}`;
    if (!geoCache.has(key)) geoCache.set(key, r === undefined ? roundedBox(w, h, d) : roundedBox(w, h, d, r));
    return geoCache.get(key);
}
function cyl(r, w, seg = 8) {
    const key = `cy${r}|${w}|${seg}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(r, r, w, seg));
    return geoCache.get(key);
}
function sph(r) {
    const key = `sp${r}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, 8, 6));
    return geoCache.get(key);
}
function plane(w, h) {
    const key = `pl${w}|${h}`;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.PlaneGeometry(w, h));
    return geoCache.get(key);
}
function mat(hex) {
    if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return matCache.get(hex);
}
function basic(hex) {
    const key = `b${hex}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: hex }));
    return matCache.get(key);
}
const toHex = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function clearChildren(root) {
    root.children.slice().forEach(child => {
        if (typeof root.remove === 'function') root.remove(child);
    });
    root.children.length = 0;
}

/** Adds a mesh to `parent`; returns it. */
function part(parent, geo, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}

function makeWheel(r, w, tyre = COLORS.CAR_WHEEL, hub = 0xE7E9F2) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(cyl(r, w), mat(tyre));
    t.rotation.z = Math.PI / 2;
    t.castShadow = true;
    g.add(t);
    g.add(new THREE.Mesh(rb(w * 1.15, r * 0.7, r * 0.7), mat(hub)));
    g.userData.r = r;
    return g;
}

function addWheel(root, wheels, x, z, r, w, tyre, hub) {
    const wheel = makeWheel(r, w, tyre, hub);
    wheel.position.set(x, r, z);
    root.add(wheel);
    wheels.push(wheel);
    return wheel;
}

// ---------------------------------------------------------------- textures
const plateTextures = { white: [], yellow: [] };
const STATES = ['RJ', 'UP', 'MP', 'HR', 'DL', 'GJ'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVZ';

/** An Indian format number such as "RJ 14 CA 1234". */
export function randomPlateText() {
    const l = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const digits = (n) => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, '0');
    return `${pick(STATES)} ${digits(2)} ${l()}${l()} ${digits(4)}`;
}

function plateMaterial(yellow) {
    const pool = yellow ? plateTextures.yellow : plateTextures.white;
    if (pool.length < 8) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = yellow ? '#FFD23F' : '#F6F6F0';
        ctx.fillRect(0, 0, 128, 32);
        ctx.fillStyle = '#2A2A33';
        ctx.fillRect(0, 0, 128, 2);
        ctx.fillRect(0, 30, 128, 2);
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(randomPlateText(), 64, 17);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        pool.push(new THREE.MeshBasicMaterial({ map: tex }));
    }
    return pick(pool);
}

const truckTextures = new Map();
function truckTexture(kind, colorHex) {
    const key = `${kind}${colorHex}`;
    if (truckTextures.has(key)) return truckTextures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'rear' ? 128 : 256;
    canvas.height = kind === 'rear' ? 64 : 64;
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const css = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, w, h);
    // Painted borders and a flower band, like a decorated lorry
    ctx.fillStyle = '#FFE066';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillStyle = '#E8626E';
    ctx.fillRect(0, 6, w, 3);
    ctx.fillRect(0, h - 9, w, 3);
    ctx.fillStyle = '#FFFFFF';
    for (let x = 8; x < w; x += 20) ctx.fillRect(x, h - 18, 8, 6);
    ctx.fillStyle = '#2A2A33';
    ctx.font = kind === 'rear' ? 'bold 17px sans-serif' : 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Horn OK Please', w / 2, h / 2 - 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex });
    truckTextures.set(key, m);
    return m;
}

// ---------------------------------------------------------------- cars
// L/W/H: body length/width/height, r: wheel radius, cab: cabin height, length
// (fraction of L), width (fraction of W) and z shift (fraction of L, + = rear)
export const CAR_STYLES = [
    { id: 'tallboy',    L: 3.4,  W: 1.55, H: 1.0,  r: 0.30, cab: { h: 0.8,  l: 0.68, w: 0.94, z: 0.08 } },
    { id: 'swift',      L: 3.85, W: 1.7,  H: 0.85, r: 0.34, cab: { h: 0.5,  l: 0.5,  w: 0.9,  z: 0.12 }, spoiler: true, darkRoof: true },
    { id: 'sedan',      L: 4.2,  W: 1.7,  H: 0.95, r: 0.34, cab: { h: 0.5,  l: 0.46, w: 0.9,  z: 0.02 }, grille: true },
    { id: 'suv',        L: 4.0,  W: 1.8,  H: 1.45, r: 0.42, cab: { h: 0.7,  l: 0.72, w: 0.95, z: 0.1 },  spare: true, bullbar: true, rack: true },
    { id: 'mpv',        L: 4.5,  W: 1.8,  H: 1.15, r: 0.36, cab: { h: 0.7,  l: 0.78, w: 0.95, z: 0.08 }, grille: true },
    { id: 'ambassador', L: 4.1,  W: 1.7,  H: 0.85, r: 0.34, cab: { h: 0.62, l: 0.52, w: 0.86, z: 0.1, round: 0.28 }, classic: true },
    { id: 'sumo',       L: 4.4,  W: 1.75, H: 1.35, r: 0.4,  cab: { h: 0.7,  l: 0.74, w: 0.95, z: 0.1 },  rack: true, steps: true }
];

/**
 * Fills `root` with the model of a car and returns the userData fields to merge.
 * @param {THREE.Group} root
 * @param {number} styleIndex - index into CAR_STYLES
 * @param {number|string} paint - body colour
 * @param {boolean} taxi - white taxi with a yellow plate and roof sign
 */
export function buildCarModel(root, styleIndex, paint, taxi = false) {
    const st = CAR_STYLES[styleIndex % CAR_STYLES.length];
    clearChildren(root);
    const sprung = [];
    const P = (geo, m, x, y, z) => {
        const mesh = part(root, geo, m, x, y, z);
        sprung.push({ mesh, y });
        return mesh;
    };

    const { L, W, H, r, cab } = st;
    let bodyCol = toHex(paint);
    let cabCol = bodyCol;
    if (taxi) bodyCol = cabCol = 0xF4F4F0;
    if (st.classic && taxi && Math.random() < 0.6) { bodyCol = 0x2C2F3A; cabCol = 0xFFD23F; }
    if (st.darkRoof) cabCol = 0x3A3D4C;
    const base = r * 0.8;

    P(rb(W, H, L), mat(bodyCol), 0, base + H / 2, 0);                              // children[0]
    const cabL = L * cab.l, cabW = W * cab.w;
    const cabY = base + H + cab.h / 2 - 0.05;
    const cabZ = L * cab.z;
    P(rb(cabW, cab.h, cabL, cab.round), mat(cabCol), 0, cabY, cabZ);               // children[1]
    P(rb(cabW + 0.05, cab.h * 0.5, cabL * 0.88), mat(0x9ED8F5), 0, cabY + cab.h * 0.04, cabZ);

    const bumper = mat(st.classic ? 0xDDE0EA : 0x8A8FA0);
    P(rb(W + 0.06, 0.2, 0.22), bumper, 0, base + 0.12, -L / 2 - 0.04);
    P(rb(W + 0.06, 0.2, 0.22), bumper, 0, base + 0.12, L / 2 + 0.04);

    // Wheels (outside edge flush with the body)
    const wheels = [];
    const wx = W / 2 + 0.02, wz = L / 2 - r - 0.35;
    [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(([x, z]) =>
        addWheel(root, wheels, x, z, r, 0.25));

    // Lights
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xB85C6A });
    const lightY = base + H * 0.55;
    [-1, 1].forEach(s => {
        if (st.classic) {
            P(sph(0.15), basic(0xFFF6D0), s * W * 0.32, lightY, -L / 2 - 0.02);
        } else {
            P(rb(0.34, 0.16, 0.06), basic(COLORS.HEADLIGHT), s * W * 0.34, lightY, -L / 2 - 0.03);
        }
        P(rb(0.3, 0.14, 0.06), tailMat, s * W * 0.36, lightY, L / 2 + 0.03);
    });

    // Number plates: yellow on taxis, white on private cars
    const plate = plateMaterial(taxi);
    const frontPlate = P(plane(0.62, 0.16), plate, 0, base + 0.34, -L / 2 - 0.16);
    frontPlate.rotation.y = Math.PI;
    P(plane(0.62, 0.16), plate, 0, base + 0.34, L / 2 + 0.16);

    if (st.grille) P(rb(W * 0.5, 0.16, 0.06), mat(0xDDE0EA), 0, lightY - 0.05, -L / 2 - 0.05);
    if (st.classic) {
        P(rb(W * 0.4, 0.3, 0.08), mat(0xDDE0EA), 0, lightY - 0.05, -L / 2 - 0.05);
        [-1, 1].forEach(s => P(rb(0.22, 0.4, L * 0.28, 0.1), mat(bodyCol), s * (W / 2 - 0.02), base + 0.3, -wz));
        [-1, 1].forEach(s => P(rb(0.22, 0.4, L * 0.28, 0.1), mat(bodyCol), s * (W / 2 - 0.02), base + 0.3, wz));
    }
    if (st.spoiler) P(rb(W * 0.7, 0.06, 0.28), mat(0x3A3D4C), 0, cabY + cab.h / 2 + 0.02, cabZ + cabL / 2 - 0.1);
    if (st.bullbar) P(rb(W * 0.8, 0.4, 0.12), mat(0x2F3140), 0, base + 0.4, -L / 2 - 0.2);
    if (st.rack) P(rb(cabW * 0.85, 0.07, cabL * 0.85), mat(0x2F3140), 0, cabY + cab.h / 2 + 0.07, cabZ);
    if (st.steps) [-1, 1].forEach(s => P(rb(0.16, 0.06, L * 0.45), mat(0x2F3140), s * (W / 2 + 0.05), base + 0.02, 0));
    if (st.spare) {
        const spare = P(cyl(r * 0.95, 0.24), mat(0x3E4152), 0, base + H * 0.55, L / 2 + 0.2);
        spare.rotation.x = Math.PI / 2;
        P(cyl(r * 0.5, 0.26), mat(0xE7E9F2), 0, base + H * 0.55, L / 2 + 0.21).rotation.x = Math.PI / 2;
    }
    if (taxi) P(rb(0.5, 0.14, 0.22), basic(0xFFD23F), 0, cabY + cab.h / 2 + 0.12, cabZ - cabL * 0.15);

    return {
        kind: 'car', styleId: st.id, taxi,
        chassis: root, sprung, tailMat, wheels, wheelRadius: r,
        length: L, width: W + 0.1, height: base + H + cab.h,
        suspension: { bob: 0, bobVel: 0, pitch: 0, pitchVel: 0, roll: 0, prevSpeed: 0, accel: 0, brake: 0 }
    };
}

/** A random Indian car paint. */
export function randomCarPaint(paints) {
    return pick(paints);
}

// ---------------------------------------------------------------- auto-rickshaw
export function buildAuto(root) {
    clearChildren(root);
    const T = TRAFFIC_TYPES.auto;
    const wheels = [];
    const r = 0.3;
    addWheel(root, wheels, 0, -1.0, r, 0.18, 0x3E4152, 0xE7E9F2);
    [-0.62, 0.62].forEach(x => addWheel(root, wheels, x, 0.8, r, 0.18, 0x3E4152, 0xE7E9F2));

    const green = mat(0xA8D86B), yellow = mat(0xFFD54F), black = mat(0x2F3140);
    part(root, rb(1.3, 0.45, 2.3), green, 0, 0.62, 0.1);                    // children[0]
    part(root, rb(0.8, 0.7, 0.7), yellow, 0, 0.78, -0.95);                  // front cowl
    part(root, rb(1.3, 0.5, 0.2), yellow, 0, 0.95, 1.25);                   // rear panel
    const wind = part(root, rb(0.75, 0.5, 0.06), mat(0x9ED8F5), 0, 1.25, -0.62);
    wind.rotation.x = -0.25;
    part(root, rb(1.1, 0.4, 0.45), mat(0xD66B6B), 0, 1.0, 1.0);             // passenger seat
    // Driver
    part(root, rb(0.4, 0.5, 0.28), mat(0xE8C07A), 0, 1.2, -0.12);
    part(root, sph(0.17), mat(0xE0B38A), 0, 1.65, -0.12);
    if (Math.random() < 0.6) part(root, sph(0.13), mat(0xFFFFFF), 0.2, 1.6, 1.0).scale.set(1, 1.1, 1);
    // Canopy
    part(root, rb(1.4, 0.1, 2.1), black, 0, 1.95, 0.35);
    [[-0.62, -0.62], [0.62, -0.62], [-0.62, 1.25], [0.62, 1.25]].forEach(([x, z]) =>
        part(root, rb(0.06, 0.9, 0.06), black, x, 1.5, z));
    part(root, rb(0.3, 0.14, 0.06), basic(COLORS.HEADLIGHT), 0, 0.95, -1.32);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xB85C6A });
    [-0.45, 0.45].forEach(x => part(root, rb(0.2, 0.12, 0.05), tailMat, x, 0.95, 1.37));

    return {
        kind: 'auto', chassis: root, sprung: [], tailMat, wheels, wheelRadius: r,
        length: T.length, width: T.width, height: 2.0,
        sway: { phase: Math.random() * 6.28 }
    };
}

// ---------------------------------------------------------------- motorbike
export function buildBike(root) {
    clearChildren(root);
    const T = TRAFFIC_TYPES.bike;
    const wheels = [];
    const r = 0.33;
    addWheel(root, wheels, 0, -0.7, r, 0.14, 0x2F3140, 0xC8CCD8);
    addWheel(root, wheels, 0, 0.7, r, 0.14, 0x2F3140, 0xC8CCD8);

    const bodyCol = pick([0xE8626E, 0x6FA3E6, 0x2F3140, 0xC9CED6, 0xF2A93B]);
    part(root, rb(0.16, 0.3, 1.0), mat(0x5A5E70), 0, 0.65, 0.05);          // children[0]
    part(root, rb(0.28, 0.22, 0.42), mat(bodyCol), 0, 0.95, -0.25);        // tank
    part(root, rb(0.3, 0.1, 0.75), mat(0x2F3140), 0, 0.88, 0.32);          // seat
    const fork = part(root, rb(0.07, 0.7, 0.07), mat(0x8D93A0), 0, 0.68, -0.66);
    fork.rotation.x = 0.3;
    part(root, rb(0.7, 0.06, 0.08), mat(0x2F3140), 0, 1.05, -0.58);        // handlebar
    part(root, rb(0.18, 0.16, 0.08), basic(COLORS.HEADLIGHT), 0, 0.98, -0.72);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xB85C6A });
    part(root, rb(0.18, 0.1, 0.05), tailMat, 0, 0.9, 0.72);

    const shirt = pick([0x6FA3E6, 0xF2A93B, 0xE8626E, 0x8FD0A8, 0xFFFFFF]);
    const pants = mat(0x4B4F63), skin = mat(0xE0B38A);
    const torso = part(root, rb(0.42, 0.55, 0.3), mat(shirt), 0, 1.3, 0.15);
    torso.rotation.x = -0.25;
    part(root, sph(0.21), mat(pick([0xE8626E, 0x2F3140, 0xFFFFFF, 0x6FA3E6])), 0, 1.78, 0.02);   // helmet
    part(root, rb(0.28, 0.08, 0.1), mat(0x2F3140), 0, 1.78, -0.16);                           // visor
    [-1, 1].forEach(s => {
        part(root, rb(0.1, 0.1, 0.55), skin, s * 0.25, 1.2, -0.22);
        part(root, rb(0.14, 0.14, 0.55), pants, s * 0.17, 0.95, 0.1);
        part(root, rb(0.12, 0.4, 0.12), pants, s * 0.19, 0.7, -0.1);
    });
    let length = T.length;
    if (Math.random() < 0.45) {   // pillion rider
        part(root, rb(0.4, 0.52, 0.28), mat(pick([0xE8626E, 0xB07CE0, 0x8FD0A8])), 0, 1.25, 0.58);
        part(root, sph(0.17), mat(0x3A2F2A), 0, 1.7, 0.58);
        part(root, rb(0.36, 0.14, 0.4), pants, 0, 0.98, 0.5);
        length += 0.1;
    }
    return {
        kind: 'bike', chassis: root, sprung: [], tailMat, wheels, wheelRadius: r,
        length, width: T.width, height: 1.95, lean: 0
    };
}

// ---------------------------------------------------------------- bicycle
export function buildBicycle(root) {
    clearChildren(root);
    const T = TRAFFIC_TYPES.bicycle;
    const wheels = [];
    const r = 0.34;
    addWheel(root, wheels, 0, -0.62, r, 0.06, 0x2F3140, 0xC8CCD8);
    addWheel(root, wheels, 0, 0.62, r, 0.06, 0x2F3140, 0xC8CCD8);

    const frameCol = mat(pick([0xE8626E, 0x6FA3E6, 0x2F3140, 0x3FB27F]));
    part(root, rb(0.05, 0.05, 0.9), frameCol, 0, 0.66, 0.0);               // children[0]
    const down = part(root, rb(0.05, 0.62, 0.05), frameCol, 0, 0.62, 0.05);
    down.rotation.x = 0.55;
    part(root, rb(0.05, 0.4, 0.05), frameCol, 0, 0.83, -0.5);              // stem
    part(root, rb(0.5, 0.05, 0.05), mat(0x2F3140), 0, 1.03, -0.52);        // handlebar
    part(root, rb(0.16, 0.06, 0.28), mat(0x2F3140), 0, 1.0, 0.28);         // seat
    const crank = new THREE.Group();
    crank.position.set(0, 0.38, 0.12);
    root.add(crank);
    const pedals = [-1, 1].map(s => {
        const p = part(crank, rb(0.12, 0.04, 0.14), mat(0x2F3140), s * 0.12, 0.16 * s, 0);
        return p;
    });
    part(crank, rb(0.04, 0.34, 0.04), mat(0x8D93A0), 0, 0, 0);
    // Rider
    const shirt = mat(pick([0xF2A93B, 0xE8626E, 0x6FA3E6, 0xFFFFFF]));
    const skin = mat(0xE0B38A), pants = mat(0x4B4F63);
    const torso = part(root, rb(0.34, 0.5, 0.24), shirt, 0, 1.32, 0.12);
    torso.rotation.x = -0.35;
    part(root, sph(0.18), skin, 0, 1.75, -0.05);
    part(root, sph(0.19), mat(pick([0xFFFFFF, 0xF2A93B, 0xE8626E])), 0, 1.84, -0.04).scale.set(1, 0.6, 1);   // cap / turban
    [-1, 1].forEach(s => part(root, rb(0.08, 0.08, 0.55), skin, s * 0.18, 1.15, -0.22));
    const legs = [-1, 1].map((s, i) => {
        const thigh = new THREE.Group();
        thigh.position.set(s * 0.1, 1.0, 0.28);
        root.add(thigh);
        part(thigh, rb(0.12, 0.45, 0.12), pants, 0, -0.22, 0);
        const shin = new THREE.Group();
        shin.position.set(0, -0.45, 0);
        thigh.add(shin);
        part(shin, rb(0.1, 0.45, 0.1), skin, 0, -0.22, 0);
        part(shin, rb(0.12, 0.06, 0.2), mat(0x2F3140), 0, -0.46, -0.04);
        return { thigh, shin, offset: i * Math.PI };
    });
    return {
        kind: 'bicycle', chassis: root, sprung: [], wheels, wheelRadius: r,
        length: T.length, width: T.width, height: 1.95,
        pedal: { phase: Math.random() * 6.28, crank, pedals, legs }
    };
}

// ---------------------------------------------------------------- truck
const TRUCK_PAINTS = [0xE8626E, 0x6FA3E6, 0xF2A93B, 0x3FB27F, 0xB07CE0];
export function buildTruck(root) {
    clearChildren(root);
    const T = TRAFFIC_TYPES.truck;
    const sprung = [];
    const P = (geo, m, x, y, z) => {
        const mesh = part(root, geo, m, x, y, z);
        sprung.push({ mesh, y });
        return mesh;
    };
    const paint = pick(TRUCK_PAINTS);
    const wheels = [];
    const r = 0.55;
    [-1.1, 1.1].forEach(x => {
        addWheel(root, wheels, x, -3.2, r, 0.32, 0x2F3140, 0xE7E9F2);
        addWheel(root, wheels, x, 2.0, r, 0.32, 0x2F3140, 0xE7E9F2);
        addWheel(root, wheels, x, 3.2, r, 0.32, 0x2F3140, 0xE7E9F2);
    });

    P(rb(2.2, 0.4, 8.2), mat(0x3E4152), 0, 0.85, 0);                            // children[0] chassis
    P(rb(2.4, 1.7, 2.3), mat(paint), 0, 1.95, -3.1);                            // cab
    P(rb(2.1, 0.7, 0.08), mat(0x9ED8F5), 0, 2.3, -4.27);                        // windshield
    P(rb(1.8, 0.5, 0.1), mat(0xDDE0EA), 0, 1.35, -4.27);                        // grille
    P(rb(2.5, 0.3, 0.3), mat(0x8A8FA0), 0, 0.75, -4.35);                        // bumper
    P(rb(2.5, 0.12, 0.7), mat(0xFFD54F), 0, 2.88, -3.9);                        // roof visor
    P(rb(2.5, 0.25, 5.6), mat(0x8A6A4A), 0, 1.2, 1.45);                         // bed
    P(rb(2.5, 1.6, 5.5), mat(paint), 0, 2.1, 1.45);                             // painted cargo box
    P(rb(2.4, 0.45, 5.3), mat(0xE8D9B0), 0, 3.0, 1.45);                         // tarp-covered load
    const sideMat = truckTexture('side', paint);
    [-1, 1].forEach(s => {
        const side = P(plane(5.3, 1.3), sideMat, s * 1.27, 2.1, 1.45);
        side.rotation.y = s * Math.PI / 2;
    });
    P(plane(2.3, 1.3), truckTexture('rear', paint), 0, 2.1, 4.22);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xB85C6A });
    [-1, 1].forEach(s => {
        P(rb(0.3, 0.16, 0.06), basic(COLORS.HEADLIGHT), s * 0.8, 1.2, -4.33);
        P(rb(0.3, 0.16, 0.06), tailMat, s * 1.0, 1.0, 4.2);
    });
    const plate = plateMaterial(true);
    P(plane(0.62, 0.16), plate, 0, 0.8, 4.25);
    const fp = P(plane(0.62, 0.16), plate, 0, 0.5, -4.53);
    fp.rotation.y = Math.PI;

    return {
        kind: 'truck', chassis: root, sprung, tailMat, wheels, wheelRadius: r,
        length: T.length, width: T.width, height: 3.3,
        suspension: { bob: 0, bobVel: 0, pitch: 0, pitchVel: 0, roll: 0, prevSpeed: 0, accel: 0, brake: 0 }
    };
}

// ---------------------------------------------------------------- tractor + trolley
export function buildTractor(root) {
    clearChildren(root);
    const T = TRAFFIC_TYPES.tractor;
    const wheels = [];
    const body = mat(pick([0xE8626E, 0x6FA3E6, 0x3FB27F]));
    const dark = mat(0x3E4152);
    // Tractor (front 40% of the length)
    part(root, rb(1.2, 0.8, 2.6), body, 0, 1.1, -2.1);                          // children[0] engine
    part(root, rb(0.9, 0.5, 0.1), mat(0xDDE0EA), 0, 1.1, -3.45);               // grille
    part(root, rb(1.1, 0.7, 0.9), body, 0, 1.55, -0.65);                        // seat housing
    part(root, rb(1.3, 0.08, 1.2), dark, 0, 2.55, -0.65);                       // canopy
    [[-0.55, -1.1], [0.55, -1.1], [-0.55, -0.2], [0.55, -0.2]].forEach(([x, z]) =>
        part(root, rb(0.05, 0.9, 0.05), dark, x, 2.05, z));
    part(root, rb(0.3, 0.1, 0.1), mat(0x2F3140), 0, 2.0, -1.4);                  // steering wheel
    part(root, rb(0.36, 0.5, 0.26), mat(0xF2A93B), 0, 1.95, -0.7);              // driver
    part(root, sph(0.2), mat(0xFF9A3C), 0, 2.4, -0.7);                           // turban
    part(root, cyl(0.07, 0.8, 6), dark, 0.3, 1.9, -2.6);                         // exhaust
    addWheel(root, wheels, -0.95, -0.4, 0.7, 0.42, 0x2F3140, 0xE7E9F2);
    addWheel(root, wheels, 0.95, -0.4, 0.7, 0.42, 0x2F3140, 0xE7E9F2);
    addWheel(root, wheels, -0.7, -2.7, 0.4, 0.26, 0x2F3140, 0xE7E9F2);
    addWheel(root, wheels, 0.7, -2.7, 0.4, 0.26, 0x2F3140, 0xE7E9F2);
    part(root, rb(0.2, 0.2, 1.1), dark, 0, 0.7, 0.55);                           // hitch
    // Trolley
    const trolley = mat(pick([0x3FB27F, 0xF2A93B, 0x6FA3E6]));
    part(root, rb(2.0, 0.25, 3.6), dark, 0, 0.95, 2.2);
    part(root, rb(2.1, 0.7, 3.6, 0.08), trolley, 0, 1.4, 2.2);
    part(root, rb(1.9, 0.9, 3.3), mat(0xE8CC7A), 0, 2.0, 2.2);                   // hay / sacks
    addWheel(root, wheels, -1.0, 2.9, 0.5, 0.3, 0x2F3140, 0xE7E9F2);
    addWheel(root, wheels, 1.0, 2.9, 0.5, 0.3, 0x2F3140, 0xE7E9F2);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xB85C6A });
    [-1, 1].forEach(s => part(root, rb(0.2, 0.12, 0.05), tailMat, s * 0.85, 1.2, 4.04));
    part(root, rb(0.3, 0.14, 0.06), basic(COLORS.HEADLIGHT), 0.35, 1.3, -3.42);

    return {
        kind: 'tractor', chassis: root, sprung: [], tailMat, wheels, wheelRadius: 0.5,
        length: T.length, width: T.width, height: 3.0, bounce: Math.random() * 6.28
    };
}

// ---------------------------------------------------------------- animation
/**
 * Per-frame animation for the non-car vehicle types (wheels already spun by
 * the caller). Cars and trucks use the shared suspension instead.
 * @param {THREE.Group} v
 * @param {number} dt
 * @param {{time:number, yawRate:number, vlat:number}} ctx
 */
export function animateModel(v, dt, ctx) {
    const d = v.userData;
    const speed = d.speed || 0;
    if (d.kind === 'auto') {
        const s = Math.min(1, speed / 8);
        const target = Math.sin(ctx.time * 2.3 + d.sway.phase) * 0.03 * s + ctx.yawRate * 0.12;
        v.rotation.z += (target - v.rotation.z) * Math.min(1, 6 * dt);
        v.rotation.x = Math.sin(ctx.time * 7 + d.sway.phase) * 0.008 * s;
    } else if (d.kind === 'bike') {
        // Lean into bends and into sideways moves
        const target = THREE.MathUtils.clamp(ctx.yawRate * 0.9 + ctx.vlat * 0.05, -0.32, 0.32);
        d.lean += (target - d.lean) * Math.min(1, 5 * dt);
        v.rotation.z = d.lean;
    } else if (d.kind === 'bicycle') {
        const p = d.pedal;
        p.phase += (speed / d.wheelRadius) * 0.4 * dt;
        p.crank.rotation.x = p.phase;
        p.pedals.forEach((pedal, i) => { pedal.rotation.x = -p.phase; });
        p.legs.forEach(leg => {
            const ph = p.phase + leg.offset;
            leg.thigh.rotation.x = 0.7 + 0.5 * Math.sin(ph);
            leg.shin.rotation.x = -(0.9 - 0.6 * Math.sin(ph));
        });
        d.lean = (d.lean || 0) + ((ctx.yawRate * 0.6 + ctx.vlat * 0.06) - (d.lean || 0)) * Math.min(1, 5 * dt);
        v.rotation.z = THREE.MathUtils.clamp(d.lean, -0.25, 0.25) + Math.sin(p.phase) * 0.02;
    } else if (d.kind === 'tractor') {
        const s = Math.min(1, speed / 6);
        v.rotation.x = Math.sin(ctx.time * 9 + d.bounce) * 0.006 * s;
        v.rotation.z = Math.sin(ctx.time * 3.1 + d.bounce) * 0.01 * s + ctx.yawRate * 0.05;
    }
}

export { setRGB };
