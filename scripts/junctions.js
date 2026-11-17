// =============================================
// JUNCTIONS - roundabouts, crossroads and T-junctions along the route
//
// ORDER MATTERS: main.js must call registerJunctionZones() FIRST THING, before
// createEndlessWorld(), so every junction site is already a straight zone of
// the road path when the road is built. Then, after the world exists, call
// createJunctions({ scene, bus, journey }) and junctions.update(dt) per frame.
//
// Design: the highway never leaves its lanes. A roundabout is a "through"
// roundabout: a ring road with a grass island split in two halves (fountain on
// one, clock tower on the other) and the four-lane highway cutting straight
// across, with give-way markings at every entry and side roads leaving into
// the scenery. This keeps autopilot, AI traffic and road edges unchanged.
// Signalled junctions (crossroads / T) get zebra crossings, stop lines,
// traffic lights on poles, a police booth and a little cross traffic.
//
// Everything is built lazily when the bus is within BUILD_RANGE metres.
// =============================================

import * as THREE from 'three';
import { COLORS, JUNCTIONS, PLAYER_START_Z, ROUTE, BUS_LENGTH } from './constants.js';
import { roundedBox, setHex, pastel } from './rounded.js';
import { addStraightZone, roadCenterX } from './roadpath.js';

// ---------------------------------------------------------------- site table
/** One entry per junction: world z, kind and whether it has traffic lights. */
export const JUNCTION_DEFS = JUNCTIONS.SITES.map((site, index) => ({
    id: `junction-${index}`,
    index,
    name: site.name,
    kind: site.kind,
    km: site.km,
    z: PLAYER_START_Z - site.km * ROUTE.UNITS_PER_KM,
    signalized: site.kind !== 'roundabout',
    stopLineZ: PLAYER_START_Z - site.km * ROUTE.UNITS_PER_KM + JUNCTIONS.STOP_LINE,
    // Each junction starts its signal cycle at a different moment
    phaseOffset: (index * 7.3) % JUNCTIONS.SIGNAL_PERIOD
}));

let zonesRegistered = false;

/**
 * Makes every junction site a straight stretch of road. Idempotent. Call it
 * before the endless world is created (the road reads the zones as it is built).
 */
export function registerJunctionZones() {
    if (zonesRegistered) return;
    zonesRegistered = true;
    for (const def of JUNCTION_DEFS) addStraightZone(def.z, JUNCTIONS.ZONE_HALF);
}

// ------------------------------------------------------------------- signals
// One cycle (SIGNAL_PERIOD = 30 s). The highway is green for 12 s, amber 3 s,
// red 14 s (+1 s all-red). Cross traffic is green while the highway is red,
// with a clearance gap on both sides.
const HIGHWAY_GREEN = [1, 13];
const HIGHWAY_AMBER = [13, 16];
const CROSS_GREEN = [17, 27];
const CROSS_AMBER = [27, 29.5];

let signalClock = 0;

/** Signal clock in seconds (advanced by junctions.update). */
export function getSignalTime() { return signalClock; }
/** Sets the signal clock (tests, restarts). */
export function setSignalTime(t) { signalClock = t; }

function within(t, range) { return t >= range[0] && t < range[1]; }

/**
 * State of one signal head of a junction at time t.
 * @param {object} def - a JUNCTION_DEFS entry
 * @param {'highway'|'cross'} which
 * @param {number} [t] - seconds (defaults to the live signal clock)
 * @returns {'red'|'amber'|'green'|null} null for junctions without lights
 */
export function signalPhase(def, which = 'highway', t = signalClock) {
    if (!def.signalized) return null;
    const p = JUNCTIONS.SIGNAL_PERIOD;
    const local = (((t + def.phaseOffset) % p) + p) % p;
    if (which === 'highway') {
        if (within(local, HIGHWAY_GREEN)) return 'green';
        if (within(local, HIGHWAY_AMBER)) return 'amber';
        return 'red';
    }
    if (within(local, CROSS_GREEN)) return 'green';
    if (within(local, CROSS_AMBER)) return 'amber';
    return 'red';
}

/**
 * The signal governing the bus's direction at world depth z.
 * Reports a signal from APPROACH metres before its stop line up to the stop
 * line itself; once past the line (inside the junction box) it returns null,
 * because the driver is already committed.
 * @param {number} z - world z of the thing asking (use the bus nose: z - BUS_LENGTH/2)
 * @returns {'red'|'amber'|'green'|null}
 */
export function signalStateAt(z) {
    const ahead = signalAhead(z);
    return ahead ? ahead.state : null;
}

/**
 * Nearest signal ahead of z (towards -Z) within APPROACH metres.
 * @param {number} z
 * @returns {{state: string, stopLineZ: number, gap: number, junction: object}|null}
 *          gap = metres from z to the stop line
 */
export function signalAhead(z) {
    let best = null;
    for (const def of JUNCTION_DEFS) {
        if (!def.signalized) continue;
        const gap = z - def.stopLineZ;
        if (gap < 0 || gap > JUNCTIONS.APPROACH) continue;
        if (!best || gap < best.gap) best = { gap, junction: def };
    }
    if (!best) return null;
    return {
        state: signalPhase(best.junction, 'highway'),
        stopLineZ: best.junction.stopLineZ,
        gap: best.gap,
        junction: best.junction
    };
}

// ------------------------------------------------------------ small builders
const PALETTE = {
    asphalt: COLORS.ASPHALT,
    line: COLORS.WHITE_LINE,
    yellow: COLORS.YELLOW_LINE,
    grass: pastel(COLORS.GRASS, 0.05),
    kerbA: 0xFFFFFF,
    kerbB: 0xFF9AA2,
    stone: 0xF3E7D3,
    water: 0x8FD8F0,
    pole: 0x5B6070,
    lampOff: 0x3A3D4C,
    red: 0xFF4D4D,
    amber: 0xFFC83D,
    green: 0x4DDB8A
};

const materialCache = new Map();

// Flat layers sit slightly above the highway and are pulled towards the camera
// so they never z-fight with the road ribbon (which uses polygonOffset too).
function layerMaterial(color, layer) {
    const key = `${color}:${layer}`;
    let m = materialCache.get(key);
    if (!m) {
        m = new THREE.MeshLambertMaterial({
            color,
            polygonOffset: true,
            polygonOffsetFactor: -4 - layer * 3,
            polygonOffsetUnits: -8 - layer * 6
        });
        materialCache.set(key, m);
    }
    return m;
}

function solidMaterial(color) {
    const key = `solid:${color}`;
    let m = materialCache.get(key);
    if (!m) {
        m = new THREE.MeshLambertMaterial({ color });
        materialCache.set(key, m);
    }
    return m;
}

const layerY = (layer) => 0.03 + layer * 0.015;

/** Flat rectangle on the ground (w along x, d along z), optionally yawed. */
function flat(parent, w, d, color, x, z, layer = 2, yaw = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), layerMaterial(color, layer));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    if (yaw === 0) {
        mesh.position.set(x, layerY(layer), z);
        parent.add(mesh);
    } else {
        const pivot = new THREE.Group();
        pivot.position.set(x, layerY(layer), z);
        pivot.rotation.y = yaw;
        pivot.add(mesh);
        parent.add(pivot);
    }
    return mesh;
}

/** Flat disc on the ground. */
function disc(parent, r, color, x, z, layer, thetaStart, thetaLength, segs = 48) {
    const geo = thetaStart === undefined
        ? new THREE.CircleGeometry(r, segs)
        : new THREE.CircleGeometry(r, segs, thetaStart, thetaLength);
    const mesh = new THREE.Mesh(geo, layerMaterial(color, layer));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, layerY(layer), z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

/** Solid (rounded) block standing on the ground at height y (centre). */
function block(parent, w, h, d, color, x, y, z, round = true) {
    const geo = round ? roundedBox(w, h, d, Math.min(0.12, Math.min(w, h, d) * 0.3)) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, solidMaterial(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function cylinder(parent, rTop, rBottom, h, color, x, y, z, segs = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), solidMaterial(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function sphere(parent, r, color, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), solidMaterial(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}

/** A pastel lollipop tree. */
function tree(parent, x, z, scale = 1, colorIndex = 0) {
    const crown = COLORS.TREE_FOLIAGE[colorIndex % COLORS.TREE_FOLIAGE.length];
    cylinder(parent, 0.18 * scale, 0.24 * scale, 1.6 * scale, COLORS.TREE_TRUNK, x, 0.8 * scale, z, 8);
    sphere(parent, 1.3 * scale, crown, x, 2.4 * scale, z);
}

/** Kerb block (red/white alternating) lying on the ground, yawed to follow a curve. */
function kerb(parent, length, x, z, yaw, alt) {
    const mesh = block(parent, length, 0.3, 0.55, alt ? PALETTE.kerbB : PALETTE.kerbA, x, 0.15, z, false);
    mesh.rotation.y = yaw;
    return mesh;
}

// ------------------------------------------------------------ road furniture
const HALF_HIGHWAY = 7.8;     // junction box half width (carriageway + shoulders)
const CROSS_HALF = 5;         // half width of a cross road
const CROSS_LENGTH = 95;      // how far side roads run off into the scenery

/** Dashed centre line along a leg of the given length, running along local +x. */
function legCentreDashes(parent, from, length) {
    for (let x = from; x < from + length - 2; x += 5) flat(parent, 2.4, 0.22, PALETTE.line, x, 0, 3);
}

/**
 * A side road stub leaving the junction at `angle` (radians in the x-z plane,
 * 0 = +x), starting at distance `fromR` from the junction centre.
 */
function sideRoad(parent, angle, fromR, length, width = 8) {
    const leg = new THREE.Group();
    leg.rotation.y = -angle;
    flat(leg, length, width, PALETTE.asphalt, fromR + length / 2, 0, 1);
    legCentreDashes(leg, fromR + 4, length - 4);
    // Edge lines
    flat(leg, length, 0.16, PALETTE.line, fromR + length / 2, width / 2 - 0.4, 3);
    flat(leg, length, 0.16, PALETTE.line, fromR + length / 2, -width / 2 + 0.4, 3);
    // Give-way bars where the leg meets the junction
    for (let i = 0; i < 4; i++) flat(leg, 0.55, 1.1, PALETTE.line, fromR + 1.2, -width / 2 + 1.2 + i * 1.7, 3);
    // A few trees along it
    for (let i = 0; i < 6; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        tree(leg, fromR + 14 + i * 12, side * (width / 2 + 5 + (i % 3) * 2), 0.9 + (i % 3) * 0.15, i);
    }
    parent.add(leg);
    return leg;
}

/** A small round "keep left / roundabout" style blue sign on a post. */
function roundSign(parent, x, z, yaw, color = 0x2F7FD6) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    cylinder(g, 0.06, 0.06, 2.6, PALETTE.pole, 0, 1.3, 0, 6);
    const face = cylinder(g, 0.55, 0.55, 0.08, color, 0, 2.7, 0.08, 16);
    face.rotation.x = Math.PI / 2;
    const rim = cylinder(g, 0.4, 0.4, 0.1, 0xFFFFFF, 0, 2.7, 0.12, 16);
    rim.rotation.x = Math.PI / 2;
    parent.add(g);
}

// ---------------------------------------------------------------- roundabout
function buildRoundabout(root) {
    const R = JUNCTIONS.RING_R;
    const I = JUNCTIONS.ISLAND_R;
    const chordX = HALF_HIGHWAY + 0.1;
    const a = Math.acos(chordX / I);                // half angle of each island cap

    // Ring road, grass island halves, then the highway cutting across on top
    disc(root, R, PALETTE.asphalt, 0, 0, 1, undefined, undefined, 56);
    disc(root, I, PALETTE.grass, 0, 0, 2, -a, 2 * a, 40);
    disc(root, I, PALETTE.grass, 0, 0, 2, Math.PI - a, 2 * a, 40);
    const stripLen = 2 * Math.sqrt(R * R - HALF_HIGHWAY * HALF_HIGHWAY);
    flat(root, HALF_HIGHWAY * 2, stripLen, PALETTE.asphalt, 0, 0, 3);

    // Side roads: one leaves behind-right, one ahead-left
    const legAngles = [20 * Math.PI / 180, 200 * Math.PI / 180];
    sideRoad(root, legAngles[0], R - 2, CROSS_LENGTH);
    sideRoad(root, legAngles[1], R - 2, CROSS_LENGTH);

    // Highway lane lines through the junction (double yellow + dashed lane dividers)
    // run outside the island; across the ring only the centre line continues.
    flat(root, 0.16, stripLen, PALETTE.yellow, -0.18, 0, 4);
    flat(root, 0.16, stripLen, PALETTE.yellow, 0.18, 0, 4);

    // Give-way (dashed) lines across all four entries of the highway
    for (const s of [1, -1]) {
        for (let x = -5.4; x <= 5.5; x += 1.8) flat(root, 1.1, 0.5, PALETTE.line, x, s * (R + 1.5), 4);
        // Roundabout signs on both sides of each entry
        roundSign(root, -HALF_HIGHWAY - 1.4, s * (R + 6), s > 0 ? 0 : Math.PI);
        roundSign(root, HALF_HIGHWAY + 1.4, s * (R + 6), s > 0 ? 0 : Math.PI);
    }

    // Circulating lane dashes between the island and the outer edge
    const skip = [
        { angle: Math.PI / 2, half: 0.5 }, { angle: -Math.PI / 2, half: 0.5 },
        { angle: legAngles[0], half: 0.3 }, { angle: legAngles[1], half: 0.3 }
    ];
    const angleGap = (th, angle) => Math.abs(((th - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const blocked = (th, extra = 0) => skip.some(s => angleGap(th, s.angle) < s.half + extra);
    const DASHES = 40;
    for (let i = 0; i < DASHES; i++) {
        const th = (i / DASHES) * Math.PI * 2;
        if (blocked(th)) continue;
        const r = (I + R) / 2;
        flat(root, 1.8, 0.2, PALETTE.line, r * Math.cos(th), r * Math.sin(th), 3, -(th + Math.PI / 2));
    }

    // Kerbs: island arcs and the chords along the highway
    const arcSteps = 16;
    for (const centre of [0, Math.PI]) {
        for (let i = 0; i <= arcSteps; i++) {
            const th = centre - a + (2 * a * i) / arcSteps;
            const len = (2 * a * (I + 0.3)) / arcSteps * 1.1;
            kerb(root, len, (I + 0.28) * Math.cos(th), (I + 0.28) * Math.sin(th), -(th + Math.PI / 2), i % 2 === 0);
        }
    }
    const chordHalf = Math.sqrt(I * I - chordX * chordX);
    for (const s of [1, -1]) {
        for (let z = -chordHalf + 1; z < chordHalf; z += 2) {
            const k = kerb(root, 2, s * (chordX + 0.2), z, Math.PI / 2, ((z + chordHalf) / 2 | 0) % 2 === 0);
            k.rotation.y = Math.PI / 2;
        }
    }

    // Outer ring kerb (skipping the highway and side road mouths)
    const OUTER = 44;
    for (let i = 0; i < OUTER; i++) {
        const th = (i / OUTER) * Math.PI * 2;
        if (blocked(th, 0.22)) continue;
        kerb(root, 2.9, (R + 0.3) * Math.cos(th), (R + 0.3) * Math.sin(th), -(th + Math.PI / 2), i % 2 === 0);
    }

    // --- Fountain on the right island ---
    const fx = (chordX + I) / 2 + 0.3;
    const fountain = new THREE.Group();
    fountain.position.set(fx, 0, 0);
    cylinder(fountain, 2.4, 2.5, 0.5, PALETTE.stone, 0, 0.25, 0, 20);
    cylinder(fountain, 2.1, 2.1, 0.06, PALETTE.water, 0, 0.5, 0, 20);
    cylinder(fountain, 0.28, 0.4, 1.6, PALETTE.stone, 0, 1.1, 0, 10);
    cylinder(fountain, 1.1, 0.7, 0.25, PALETTE.stone, 0, 1.95, 0, 14);
    cylinder(fountain, 0.9, 0.9, 0.05, PALETTE.water, 0, 2.1, 0, 14);
    const jets = [];
    for (let i = 0; i < 4; i++) {
        const th = (i / 4) * Math.PI * 2 + 0.4;
        jets.push(sphere(fountain, 0.22, PALETTE.water, 1.3 * Math.cos(th), 0.9, 1.3 * Math.sin(th)));
    }
    const top = sphere(fountain, 0.3, PALETTE.water, 0, 2.6, 0);
    root.add(fountain);

    // Flower beds and trees round the fountain
    for (let i = 0; i < 5; i++) {
        const th = (i / 5) * Math.PI * 2 + 0.5;
        sphere(root, 0.55, [0xFFA8C8, 0xFFD58A, 0xC9A8F5, 0xFF9AA2, 0xFFC49B][i], fx + 3.2 * Math.cos(th) * 0.6, 0.35, 3.2 * Math.sin(th));
    }
    tree(root, fx + 0.5, 4.4, 0.8, 0);
    tree(root, fx + 0.5, -4.4, 0.8, 1);

    // --- Clock tower on the left island ---
    const tower = new THREE.Group();
    tower.position.set(-fx, 0, 0);
    cylinder(tower, 2.2, 2.4, 0.5, PALETTE.stone, 0, 0.25, 0, 18);
    block(tower, 2.2, 0.8, 2.2, 0xFFD6E0, 0, 0.9, 0);
    block(tower, 1.5, 5.2, 1.5, 0xFFEBC6, 0, 3.9, 0);
    block(tower, 2.0, 0.5, 2.0, 0xFF9AA2, 0, 6.7, 0);
    for (const [fxs, fzs, ry] of [[0, 0.78, 0], [0, -0.78, Math.PI], [0.78, 0, Math.PI / 2], [-0.78, 0, -Math.PI / 2]]) {
        const face = cylinder(tower, 0.55, 0.55, 0.08, 0xFFFFFF, fxs, 5.4, fzs, 16);
        // Euler order is XYZ, so tilt the disc's axis onto z (north/south faces) or x (east/west faces)
        if (fzs !== 0) face.rotation.x = Math.PI / 2; else face.rotation.z = Math.PI / 2;
        const hand = block(tower, 0.07, 0.4, 0.04, 0x3A3D4C, fxs * 1.05, 5.5, fzs * 1.05 + (fzs === 0 ? 0 : Math.sign(fzs) * 0.02), false);
        hand.rotation.y = ry;
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 4), solidMaterial(0x8FD0E8));
    roof.position.set(0, 7.8, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    tower.add(roof);
    root.add(tower);
    tree(root, -fx + 0.5, 4.4, 0.8, 2);
    tree(root, -fx + 0.5, -4.4, 0.8, 3);

    return {
        animate(t) {
            jets.forEach((j, i) => { j.position.y = 0.9 + 0.35 * Math.abs(Math.sin(t * 3 + i * 1.7)); });
            top.position.y = 2.6 + 0.2 * Math.sin(t * 4);
        }
    };
}

// --------------------------------------------------------- signalled junction
function makeSignalHead(parent, x, z, yaw) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    cylinder(g, 0.1, 0.13, 4.6, PALETTE.pole, 0, 2.3, 0, 8);
    block(g, 0.75, 2.0, 0.5, 0x3A3D4C, 0, 4.4, 0.05);
    const lamps = {};
    for (const [name, y] of [['red', 5.0], ['amber', 4.4], ['green', 3.8]]) {
        const mat = new THREE.MeshBasicMaterial({ color: PALETTE.lampOff });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
        lamp.position.set(0, y, 0.32);
        g.add(lamp);
        lamps[name] = mat;
    }
    parent.add(g);
    return lamps;
}

function setLamps(lamps, state) {
    setHex(lamps.red, state === 'red' ? PALETTE.red : PALETTE.lampOff);
    setHex(lamps.amber, state === 'amber' ? PALETTE.amber : PALETTE.lampOff);
    setHex(lamps.green, state === 'green' ? PALETTE.green : PALETTE.lampOff);
}

function buildPoliceBooth(parent, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    block(g, 2.4, 0.3, 2.4, PALETTE.stone, 0, 0.15, 0);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        cylinder(g, 0.07, 0.07, 2.4, 0xFFFFFF, px, 1.5, pz, 6);
    }
    block(g, 2.2, 1.0, 0.1, 0xA9D4F5, 0, 1.0, -1.0, false);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.9, 0.7, 4), solidMaterial(0x6FA3E6));
    roof.position.set(0, 3.0, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // Officer: khaki body, head, cap
    cylinder(g, 0.28, 0.32, 1.0, 0xD9C27A, 0, 0.95, 0.1, 8);
    sphere(g, 0.24, 0xD4A574, 0, 1.7, 0.1);
    cylinder(g, 0.26, 0.26, 0.14, 0x4A6FA5, 0, 1.92, 0.1, 8);
    parent.add(g);
}

/** Small toy car or auto-rickshaw facing -Z. */
function buildMover(kind, color) {
    const g = new THREE.Group();
    if (kind === 'auto') {
        block(g, 1.3, 0.9, 2.0, 0xFFD54F, 0, 0.7, 0);
        block(g, 1.3, 0.1, 1.9, 0x2E7D32, 0, 1.55, 0.05);
        block(g, 1.1, 0.7, 0.1, 0xA9D4F5, 0, 1.15, -0.95, false);
    } else {
        block(g, 1.8, 0.7, 3.8, color, 0, 0.65, 0);
        block(g, 1.5, 0.6, 2.0, pastel(color, 0.5), 0, 1.25, 0.25);
        block(g, 1.3, 0.1, 0.08, 0xFFFFE0, 0, 0.7, -1.92, false);
    }
    const wz = kind === 'auto' ? [-0.7, 0.7] : [-1.2, 1.2];
    for (const zz of wz) {
        for (const xx of [-1, 1]) {
            const w = cylinder(g, 0.35, 0.35, 0.25, COLORS.CAR_WHEEL, xx * (kind === 'auto' ? 0.65 : 0.9), 0.35, zz, 10);
            w.rotation.z = Math.PI / 2;
        }
    }
    return g;
}

function buildSignalised(root, def, state) {
    const both = def.kind === 'crossroads';
    const sides = both ? [1, -1] : [1];
    const H = HALF_HIGHWAY;
    const C = CROSS_HALF;

    // Cross roads: arms plus the shared box laid over the highway
    for (const s of sides) {
        const arm = new THREE.Group();
        flat(arm, CROSS_LENGTH, C * 2, PALETTE.asphalt, s * (H + CROSS_LENGTH / 2 - 1), 0, 1);
        for (let x = H + 6; x < H + CROSS_LENGTH - 4; x += 5) flat(arm, 2.4, 0.22, PALETTE.line, s * x, 0, 3);
        flat(arm, CROSS_LENGTH, 0.16, PALETTE.line, s * (H + CROSS_LENGTH / 2 - 1), C - 0.4, 3);
        flat(arm, CROSS_LENGTH, 0.16, PALETTE.line, s * (H + CROSS_LENGTH / 2 - 1), -C + 0.4, 3);
        root.add(arm);
        for (let i = 0; i < 6; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            tree(root, s * (H + 18 + i * 12), side * (C + 6 + (i % 3) * 2), 0.9 + (i % 3) * 0.15, i + 1);
        }
        // Cross road stop line, zebra and edge lines
        flat(root, 0.5, C - 0.3, PALETTE.line, s * (H + 6.5), s > 0 ? -C / 2 + 0.1 : C / 2 - 0.1, 4);
        for (let zz = -C + 1; zz <= C - 0.5; zz += 1.2) flat(root, 3, 0.6, PALETTE.line, s * (H + 3.2), zz, 4);
    }
    flat(root, H * 2, C * 2, PALETTE.asphalt, 0, 0, 2);
    // Highway centre line returns through the box edges (kept clear in the box)
    flat(root, 0.16, 2, PALETTE.yellow, -0.18, -C - 1, 4);
    flat(root, 0.16, 2, PALETTE.yellow, 0.18, -C - 1, 4);
    flat(root, 0.16, 2, PALETTE.yellow, -0.18, C + 1, 4);
    flat(root, 0.16, 2, PALETTE.yellow, 0.18, C + 1, 4);

    // Highway zebra crossings and stop lines (bus side z>0, oncoming side z<0)
    for (const s of [1, -1]) {
        for (let x = -6.6; x <= 6.7; x += 1.2) flat(root, 0.6, 3, PALETTE.line, x, s * (C + 2.2), 4);
    }
    flat(root, 6.0, 0.5, PALETTE.line, -3.2, JUNCTIONS.STOP_LINE, 4);
    flat(root, 6.0, 0.5, PALETTE.line, 3.2, -JUNCTIONS.STOP_LINE, 4);

    // Signals: highway heads face the approaching traffic, cross heads face the arms
    const highwayHeads = [
        makeSignalHead(root, -H - 0.6, JUNCTIONS.STOP_LINE - 1.5, 0),
        makeSignalHead(root, H + 0.6, -JUNCTIONS.STOP_LINE + 1.5, Math.PI)
    ];
    const crossHeads = [];
    for (const s of sides) {
        crossHeads.push(makeSignalHead(root, s * (H + 6), s > 0 ? -C - 1 : C + 1, s > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    buildPoliceBooth(root, -H - 3.5, -C - 5);

    // Cross traffic: 2 cars/autos per arm, stopping at the stop line unless the cross light is green
    const movers = [];
    const kinds = [['car', 0xFF9AA2], ['auto', 0], ['car', 0x9AD1FF], ['auto', 0]];
    sides.forEach((s, si) => {
        for (let q = 0; q < 2; q++) {
            const [kind, color] = kinds[(si * 2 + q) % kinds.length];
            const mesh = buildMover(kind, color);
            const dir = -s;                          // from the +x arm heading -x, and vice versa
            mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
            const lane = dir > 0 ? -C / 2 : C / 2;   // keep left: +x heading drives on -z side
            root.add(mesh);
            const half = kind === 'auto' ? 1.1 : 1.9;
            movers.push({
                mesh, dir, lane, half, queue: q, speed: 0,
                x: s * (H + 50 + q * 35 + si * 6), startX: s * (H + 60 + q * 20), s
            });
        }
    });

    const tee = !both;
    return {
        animate(t, dt) {
            const hw = signalPhase(def, 'highway');
            const cr = signalPhase(def, 'cross');
            for (const lamps of highwayHeads) setLamps(lamps, hw);
            for (const lamps of crossHeads) setLamps(lamps, cr);

            for (const m of movers) {
                const lineX = m.s * (H + 8.5 + m.queue * 5.5);  // cross stop line plus queue slot
                const front = m.x + m.dir * m.half;
                const beforeLine = m.dir < 0 ? front > lineX : front < lineX;
                let target = 9;
                if (beforeLine && cr !== 'green') {
                    const room = m.dir < 0 ? front - lineX : lineX - front;
                    target = Math.min(9, Math.max(0, room * 1.5));
                    if (room < 0.3) target = 0;
                }
                m.speed += Math.sign(target - m.speed) * Math.min(Math.abs(target - m.speed), 8 * dt);
                m.x += m.dir * m.speed * dt;
                // Left the scene (or, at a T, turned off into the highway): start over
                const gone = tee ? Math.abs(m.x) < H + 1 : Math.abs(m.x) > CROSS_LENGTH + H - 5 ||
                    (m.dir < 0 ? m.x < -(H + CROSS_LENGTH - 5) : m.x > H + CROSS_LENGTH - 5);
                if (gone) { m.x = m.startX; m.speed = 0; }
                m.mesh.position.set(m.x, 0, m.lane);
            }
        }
    };
}

// -------------------------------------------------------------- the factory
/**
 * Creates every junction (lazily built) and the per-frame updater.
 * @param {{scene: THREE.Object3D, bus: THREE.Object3D, journey?: object}} options
 * @returns {{
 *   update: (dt: number) => void,
 *   list: Array<object>,
 *   getNearest: (z: number) => object|null,
 *   getViolations: () => number
 * }}
 */
export function createJunctions({ scene, bus, journey = null }) {
    registerJunctionZones();   // safety net: harmless if main.js already did it

    const list = JUNCTION_DEFS.map(def => ({
        ...def,
        x: roadCenterX(def.z),
        built: false,
        group: null,
        animate: null
    }));
    const state = { prevFront: null, violations: 0 };

    function build(j) {
        const root = new THREE.Group();
        root.position.set(j.x, 0, j.z);
        const result = j.kind === 'roundabout' ? buildRoundabout(root) : buildSignalised(root, j, state);
        j.animate = result.animate;
        j.group = root;
        j.built = true;
        scene.add(root);
    }

    function update(dt) {
        signalClock += dt;
        const busZ = bus.position.z;

        for (const j of list) {
            const dz = Math.abs(busZ - j.z);
            if (!j.built && dz < JUNCTIONS.BUILD_RANGE) build(j);
            if (!j.built) continue;
            j.group.visible = dz < JUNCTIONS.HIDE_RANGE;
            if (dz < JUNCTIONS.ANIM_RANGE && j.animate) j.animate(signalClock, dt);
        }

        // Red light running: the bus nose crossing a stop line on red
        const front = busZ - BUS_LENGTH / 2;
        if (state.prevFront !== null) {
            const moved = state.prevFront - front;
            if (moved > 0 && moved < 8) {
                for (const j of list) {
                    if (!j.signalized) continue;
                    if (state.prevFront > j.stopLineZ && front <= j.stopLineZ &&
                        signalPhase(j, 'highway') === 'red') {
                        state.violations++;
                        bus.userData.redLightRuns = (bus.userData.redLightRuns || 0) + 1;
                    }
                }
            }
        }
        state.prevFront = front;
    }

    function getNearest(z) {
        let best = null;
        let bestD = Infinity;
        for (const j of list) {
            const d = Math.abs(z - j.z);
            if (d < bestD) { bestD = d; best = j; }
        }
        return best;
    }

    return { update, list, getNearest, getViolations: () => state.violations, signalStateAt, signalAhead };
}
