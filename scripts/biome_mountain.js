// =============================================
// MOUNTAIN BIOME - an Aravalli ghat / mountain pass in the pastel toy style
// Steep rocky hillsides and road-cut strata close to the road, big layered
// peaks behind, pines on the slopes, boulders, white-and-red painted stone
// barriers, hairpin warning signs, monkeys on the barrier, drifting fog,
// plus rarer set pieces: a two-tier waterfall (animated water + mist), a stone
// arch bridge the road passes under, and a hilltop fort.
//
// Everything is built once. The world is a ring of CHUNKS (instanced scenery
// regenerated when a chunk falls behind the bus) plus small pools of
// recycled set pieces. Nothing is allocated per frame.
//
// API: createMountainBiome({ scene, bus }) -> { group, update(dt, bus, weight), setWeight(w) }
// Tunables live in MOUNTAIN_BIOME in constants.js (optional).
// =============================================

import * as THREE from 'three';
import * as CONSTANTS from './constants.js';
import { recycleBehind } from './endless.js';
import { makeSway } from './environment.js';
import { roadCenterX, roadHeading } from './roadpath.js';

const T = Object.assign({
    CHUNK_LEN: 36,          // metres of road per scenery chunk (multiple of 4)
    CHUNK_COUNT: 12,        // chunks in the ring
    BEHIND: 48,             // a chunk is recycled once its centre is this far behind the bus
    SINK: 34,               // how far the scenery is sunk when the weight is 0
    BARRIER_X: 8.6,         // lateral offset of the stone barrier centre line
    SIGN_X: 9.4,
    SIGN_COUNT: 6, SIGN_GAP: 95,
    MONKEY_COUNT: 6, MONKEY_GAP: 70,
    FOG_COUNT: 7, FOG_GAP: 55,
    WATERFALL_EVERY: 13, BRIDGE_EVERY: 17, FORT_EVERY: 15
}, CONSTANTS.MOUNTAIN_BIOME || {});

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smooth = (t) => t * t * (3 - 2 * t);

// Scratch result of pt(): world position + heading of the road point at a
// lateral offset (same maths as roadPoint() in roadpath.js, without allocating)
const P = { x: 0, z: 0, h: 0 };
function pt(z, offset) {
    const h = roadHeading(z);
    P.h = h;
    P.x = roadCenterX(z) + offset * Math.cos(h);
    P.z = z - offset * Math.sin(h);
    return P;
}

/** z near zc where the road is straightest, and how much it turns there. */
function straightestZ(zc) {
    let best = zc, turn = Infinity;
    for (let i = -3; i <= 3; i++) {
        const z = zc + i * 4;
        const t = Math.abs(roadHeading(z + 5) - roadHeading(z - 5));
        if (t < turn) { turn = t; best = z; }
    }
    return { z: best, turn };
}

const ROCK_COLORS = [0xE6D5C8, 0xD9C6BA, 0xEFE1D3, 0xCDBBB4];
const STRATA_COLORS = [0xE8B98F, 0xDDA383, 0xF0CBA0, 0xD6957D];
const MOUNT_RINGS = [0xCFA284, 0xE3B994, 0xA8CF88, 0xDDC7A0, 0xEBDCCB, 0xF4EBE0];
const SANDSTONE = 0xF0CBA0;
const WHITE = 0xF6F2EC;
const RED = 0xE2605E;

function lift(geometry, y) {
    geometry.translate(0, y, 0);
    return geometry;
}

function hashNoise(x, y, z, seed = 0) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.137) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

/** Colours a geometry by height from a palette (soft bands) and roughens it. */
function paintByHeight(geo, palette, jitter = 0.15, terrace = 0.08) {
    const pos = geo.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, pos.getY(i));
        maxY = Math.max(maxY, pos.getY(i));
    }
    const colors = new Float32Array(pos.count * 3);
    const cols = palette.map(h => new THREE.Color(h));
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const t = (y - minY) / (maxY - minY || 1);
        const n = hashNoise(x, y, z);
        const f = 1 + jitter * n + terrace * Math.sin(t * 18);
        const edge = t > 0.02 && t < 0.98;
        pos.setXYZ(i, x * f, y + (edge ? 0.02 * (maxY - minY) * n : 0), z * f);
        const k = t * (cols.length - 1);
        const i0 = Math.min(cols.length - 2, Math.floor(k));
        c.copy(cols[i0]).lerp(cols[i0 + 1], k - i0);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
}

/** Merges (non-indexed) coloured parts into one geometry. */
function mergeColored(parts) {
    let total = 0;
    const flat = parts.map(({ geo, color, y }) => {
        const g = geo.index ? geo.toNonIndexed() : geo;
        g.translate(0, y, 0);
        total += g.attributes.position.count;
        return { g, color: new THREE.Color(color) };
    });
    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const color = new Float32Array(total * 3);
    let o = 0;
    for (const { g, color: c } of flat) {
        const n = g.attributes.position.count;
        position.set(g.attributes.position.array, o * 3);
        normal.set(g.attributes.normal.array, o * 3);
        for (let i = 0; i < n; i++) {
            color[(o + i) * 3] = c.r; color[(o + i) * 3 + 1] = c.g; color[(o + i) * 3 + 2] = c.b;
        }
        o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(position, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    out.setAttribute('color', new THREE.BufferAttribute(color, 3));
    return out;
}

export function createMountainBiome({ scene, bus } = {}) {
    const group = new THREE.Group();
    group.name = 'biome-mountain';
    group.visible = false;
    group.position.y = -T.SINK;
    if (scene && scene.add) scene.add(group);

    const L = T.CHUNK_LEN;
    const CH = T.CHUNK_COUNT;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    const white = new THREE.Color(1, 1, 1);

    // ------------------------------------------------------------ materials
    const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
    const mountainMat = lambert({ vertexColors: true, flatShading: true });
    const rockMat = lambert({ flatShading: true });
    const pineMat = makeSway(lambert({ vertexColors: true, flatShading: true }), 0.03);
    const stoneMat = lambert({});
    const matCache = new Map();
    const mat = (hex) => {
        if (!matCache.has(hex)) matCache.set(hex, lambert({ color: hex }));
        return matCache.get(hex);
    };

    // ------------------------------------------------------------ geometry
    const mountainGeo = paintByHeight(lift(new THREE.ConeGeometry(1, 1, 9, 6, true), 0.5), MOUNT_RINGS);
    const pineGeo = mergeColored([
        { geo: new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6), color: 0x9C7A5E, y: 0.45 },
        { geo: new THREE.ConeGeometry(1.1, 1.7, 8), color: 0x74CDB0, y: 1.6 },
        { geo: new THREE.ConeGeometry(0.85, 1.5, 8), color: 0x8EDDA8, y: 2.5 },
        { geo: new THREE.ConeGeometry(0.55, 1.3, 8), color: 0x9BE3C4, y: 3.4 }
    ]);
    const boulderGeo = (() => {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const f = 1 + 0.22 * hashNoise(p.getX(i), p.getY(i), p.getZ(i), 3);
            p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
        }
        g.computeVertexNormals();
        return g;
    })();
    const wallGeo = lift(new THREE.BoxGeometry(0.45, 0.7, 3.7), 0.35);
    const stripeGeo = lift(new THREE.BoxGeometry(0.5, 0.16, 3.7), 0.35);
    const postGeo = lift(new THREE.BoxGeometry(0.6, 1.0, 0.6), 0.5);
    const bandGeo = new THREE.BoxGeometry(1, 1, 1);

    // ------------------------------------------------------------ instances
    const instances = [];
    function inst(geo, material, count) {
        const mesh = new THREE.InstancedMesh(geo, material, count);
        mesh.frustumCulled = false;       // instance bounds are not the geometry's
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        dummy.position.set(0, -50, 0);
        dummy.scale.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        for (let i = 0; i < count; i++) {
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, white);
        }
        group.add(mesh);
        instances.push(mesh);
        return mesh;
    }

    const PER = { mount: 14, pine: 28, boulder: 10, wall: 18, band: 16 };
    const mounts = inst(mountainGeo, mountainMat, CH * PER.mount);
    const pines = inst(pineGeo, pineMat, CH * PER.pine);
    const boulders = inst(boulderGeo, rockMat, CH * PER.boulder);
    const walls = inst(wallGeo, stoneMat, CH * PER.wall);
    const stripes = inst(stripeGeo, stoneMat, CH * PER.wall);
    const posts = inst(postGeo, stoneMat, CH * PER.wall);
    const bands = inst(bandGeo, stoneMat, CH * PER.band);

    function put(mesh, i, x, y, z, sx, sy, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    const hide = (mesh, i) => put(mesh, i, 0, -50, 0, 0, 0, 0);
    const colorHex = (mesh, i, hex) => mesh.setColorAt(i, tint.set(hex));
    const colorRGB = (mesh, i, r, g, b) => mesh.setColorAt(i, tint.setRGB(r, g, b));

    // ------------------------------------------------------------ set pieces
    function box(parent, w, h, d, hex, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    }

    // Shared animated water texture (streaks that flow down)
    const waterTex = (() => {
        const W = 16, H = 64;
        const data = new Uint8Array(W * H * 4);
        const col = [];
        for (let x = 0; x < W; x++) col.push(0.6 + Math.random() * 0.4);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const v = col[x] * (0.55 + 0.45 * Math.sin(y / H * Math.PI * 6 + x * 1.7));
                const i = (y * W + x) * 4;
                data[i] = 200 + v * 55; data[i + 1] = 228 + v * 27; data[i + 2] = 255;
                data[i + 3] = 120 + v * 135;
            }
        }
        const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 3);
        tex.needsUpdate = true;
        return tex;
    })();
    const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.9, depthWrite: false });
    const poolMat = new THREE.MeshLambertMaterial({
        color: 0x8FD3EA, transparent: true, opacity: 0.9,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mistMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.42, depthWrite: false });
    const mistGeo = new THREE.IcosahedronGeometry(1, 1);

    // Waterfall: local +x is away from the road (mirrored with rotation.y = PI)
    function buildWaterfall() {
        const outer = new THREE.Group();
        const g = new THREE.Group();
        g.position.x = 0.6;                // keeps the plunge pool clear of the barrier
        outer.add(g);
        box(g, 10, 30, 15, 0xE3B994, 13.2 + 5, 15, 0);        // main cliff, front face x=13.2
        box(g, 9.5, 9, 11, 0xDDA383, 11.6 + 4.75, 4.5, 0);     // ledge, front face x=11.6
        box(g, 3, 1.0, 12, 0xA8CF88, 11.6 + 1.5, 9.4, 0);      // mossy lip on the ledge (top above y=9)
        box(g, 1, 0.8, 16, 0xA8CF88, 13.2 + 0.5, 30.3, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 21, 0.12), waterMat);
        top.rotation.y = Math.PI / 2;
        top.position.set(13.2 - 0.08, 19.5, 0);
        g.add(top);
        const low = new THREE.Mesh(new THREE.BoxGeometry(3.4, 9.0, 0.12), waterMat);
        low.rotation.y = Math.PI / 2;
        low.position.set(11.6 - 0.08, 4.5 + 0.0, 0);
        low.scale.y = 1;
        g.add(low);
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 16), poolMat);
        pool.position.set(10.0, 0.06, 0);
        g.add(pool);
        const mist = [];
        for (let i = 0; i < 5; i++) {
            const m = new THREE.Mesh(mistGeo, mistMat);
            const s = rand(0.9, 1.5);
            m.position.set(10.3 + rand(-0.5, 0.6), 0.9 + rand(0, 1.8), rand(-1.4, 1.4));
            m.userData = { base: s, phase: rand(0, 6.3), y: m.position.y };
            m.scale.set(s * 1.4, s * 0.8, s * 1.4);
            g.add(m);
            mist.push(m);
        }
        outer.userData.mist = mist;
        return outer;
    }

    // Stone arch bridge the road passes under (open: deck far above the camera)
    function buildBridge() {
        const g = new THREE.Group();
        const stone = 0xE6D5C8;
        box(g, 34, 1.6, 8.2, stone, 0, 9.6, 0);                // deck y 8.8..10.4
        box(g, 34, 0.8, 0.5, 0xF6F2EC, 0, 10.8, 3.6);
        box(g, 34, 0.8, 0.5, 0xF6F2EC, 0, 10.8, -3.6);
        box(g, 34.2, 0.1, 0.7, RED, 0, 11.25, 3.6);
        box(g, 34.2, 0.1, 0.7, RED, 0, 11.25, -3.6);
        for (const s of [-1, 1]) {
            box(g, 8, 9.2, 8, 0xD9C6BA, s * (9.0 + 4), 4.6, 0);  // abutments, inner face |x|=9
            box(g, 8.1, 0.5, 8.2, 0xCDBBB4, s * (9.0 + 4), 3.0, 0);  // stone course, proud of the wall
        }
        for (const z of [-1, 1]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.5, 6, 24, Math.PI), mat(0xF0E4D6));
            ring.scale.z = 0.4;
            ring.position.set(0, 0, z * 4.13);
            g.add(ring);
        }
        // Keystones along the arch
        for (let i = 1; i < 6; i++) {
            const a = i / 6 * Math.PI;
            for (const z of [-1, 1]) {
                const k = box(g, 0.9, 0.9, 0.5, 0xFFB9A0, Math.cos(a) * 9.6, Math.sin(a) * 9.6, z * 4.4);
                k.rotation.z = a;
            }
        }
        return g;
    }

    // Hilltop fort / temple on its own mesa
    const mesaGeo = paintByHeight(lift(new THREE.CylinderGeometry(7, 20, 40, 10, 6), 20), MOUNT_RINGS, 0.1, 0.06);
    function buildFort() {
        const g = new THREE.Group();
        const mesa = new THREE.Mesh(mesaGeo, mountainMat);
        mesa.position.y = -1;
        g.add(mesa);
        const top = 39;                                         // mesa top (cap at y=39)
        const wall = 0xEBCBA4;
        box(g, 11, 2.6, 11, wall, 0, top + 0.8, 0);
        for (let i = -2; i <= 2; i++) {
            for (const s of [-1, 1]) {
                box(g, 0.9, 0.7, 0.9, wall, i * 2.2, top + 2.5, s * 5.2);
                box(g, 0.9, 0.7, 0.9, wall, s * 5.2, top + 2.5, i * 2.2);
            }
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 5.6, 8), mat(0xF3D8B6));
            tw.position.set(sx * 5.4, top + 2.6, sz * 5.4);
            g.add(tw);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8), mat(0xFFB9A0));
            dome.scale.y = 0.8;
            dome.position.set(sx * 5.4, top + 5.8, sz * 5.4);
            g.add(dome);
        }
        // Central temple with a stepped spire
        box(g, 4.4, 3.0, 4.4, 0xF6EBDD, 0, top + 3.0, 0);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.2, 8), mat(0xFFC49B));
        spire.position.y = top + 6.6;
        g.add(spire);
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0xFFD86B));
        finial.position.y = top + 9.0;
        g.add(finial);
        g.scale.setScalar(1.2);
        return g;
    }

    // Feature pools (a chunk borrows one while it hosts the set piece)
    const pools = { waterfall: [], bridge: [], fort: [] };
    const builders = { waterfall: buildWaterfall, bridge: buildBridge, fort: buildFort };
    const poolSize = { waterfall: 2, bridge: 2, fort: 2 };
    for (const k of Object.keys(pools)) {
        for (let i = 0; i < poolSize[k]; i++) {
            const g = builders[k]();
            g.visible = false;
            g.userData.inUse = false;
            group.add(g);
            pools[k].push(g);
        }
    }
    function acquire(type) {
        for (const g of pools[type]) {
            if (!g.userData.inUse) { g.userData.inUse = true; g.visible = true; return g; }
        }
        return null;
    }
    function release(g) {
        if (!g) return;
        g.userData.inUse = false;
        g.visible = false;
    }

    // ------------------------------------------------------------ chunks
    const chunks = [];
    for (let i = 0; i < CH; i++) {
        chunks.push({ position: { z: 1e9 }, slot: i, feature: null });
    }
    let counter = 0;

    const mxs = new Float32Array(6), mzs = new Float32Array(6);
    const mrx = new Float32Array(6), mrz = new Float32Array(6), mhs = new Float32Array(6);
    const mon = new Uint8Array(6);

    function fillSide(chunk, zc, side, ftype, fside) {
        const sI = side > 0 ? 1 : 0;
        const mBase = chunk.slot * PER.mount + sI * 7;
        const here = fside === side;
        const skipNear = ftype === 'waterfall' && here;
        const skipCut = ftype === 'bridge' || (ftype === 'waterfall' && here);
        const fortHere = ftype === 'fort' && here;

        // Near hillside (4), mid ridge (2), far peak (1)
        for (let i = 0; i < 6; i++) {
            let x, z, rx, rz, h, r, g, b, strata = 1;
            if (i < 4) {
                rx = rand(5, 7); rz = rand(7, 9); h = rand(8, 15);
                z = zc + (-L / 2 + (i + 0.5) * L / 4) + rand(-2, 2);
                x = side * (12 + rx * 1.2 + rand(0, 2));      // lateral offset (road bends add margin)
                r = rand(0.96, 1.04); g = rand(0.96, 1.04); b = rand(0.94, 1.02);
            } else {
                rx = rand(9, 13); rz = rand(10, 15); h = rand(16, 28);
                z = zc + (-L / 2 + (i - 3.5) * L / 2) + rand(-4, 4);
                x = side * (22 + rx * 0.6 + rand(0, 10));
                r = 0.92; g = 0.94; b = 1.0;
            }
            mon[i] = (i < 4 && skipNear) ? 0 : 1;
            mxs[i] = x; mzs[i] = z; mrx[i] = rx; mrz[i] = rz; mhs[i] = h;
            if (mon[i]) {
                pt(z, x);
                put(mounts, mBase + i, P.x, -0.6, P.z, rx, h, rz, P.h + rand(-0.3, 0.3));
                colorRGB(mounts, mBase + i, r, g, b);
            } else hide(mounts, mBase + i);
        }
        // Far peak (layered haze colour)
        if (fortHere) hide(mounts, mBase + 6);
        else {
            const rx = rand(16, 24), rz = rand(18, 26), h = rand(32, 58);
            pt(zc + rand(-6, 6), side * (55 + rand(0, 35)));
            put(mounts, mBase + 6, P.x, -0.6, P.z, rx, h, rz, P.h + rand(-0.3, 0.3));
            colorRGB(mounts, mBase + 6, 0.8, 0.82, 0.96);
        }

        // Pines on the slopes
        const pBase = chunk.slot * PER.pine + sI * 14;
        for (let i = 0; i < 14; i++) {
            const m = Math.floor(Math.random() * 6);
            let ok = mon[m] === 1;
            let x = 0, y = 0, z = 0;
            if (ok) {
                const a = Math.random() * Math.PI * 2;
                const d = rand(0.25, 0.85);
                x = mxs[m] + Math.cos(a) * d * mrx[m] * 0.85;     // lateral offset
                z = mzs[m] + Math.sin(a) * d * mrz[m] * 0.85;     // road z
                y = -0.6 + mhs[m] * (1 - d) - 0.25;
                if (Math.abs(x) < 11 || (ftype === 'bridge' && Math.abs(x) < 18)) ok = false;
            }
            if (ok) {
                const s = rand(0.9, 1.8);
                pt(z, x);
                put(pines, pBase + i, P.x, y, P.z, s, s * rand(0.9, 1.3), s, Math.random() * 6.28);
                colorRGB(pines, pBase + i, rand(0.85, 1), rand(0.9, 1), rand(0.85, 1));
            } else hide(pines, pBase + i);
        }

        // Boulders by the road
        const bBase = chunk.slot * PER.boulder + sI * 5;
        for (let i = 0; i < 5; i++) {
            if (skipNear && Math.random() < 0.6) { hide(boulders, bBase + i); continue; }
            const s = rand(0.5, 1.6);
            pt(zc + rand(-L / 2, L / 2), side * (8.8 + s * 1.6 + rand(0, 6)));   // stays clear of |offset| < 8
            put(boulders, bBase + i, P.x, 0.25 * s, P.z,
                s * rand(0.9, 1.4), s, s * rand(0.9, 1.4), Math.random() * 6.28);
            colorHex(boulders, bBase + i, pick(ROCK_COLORS));
        }

        // Road-cut rock faces with strata (two terraced segments)
        for (let s = 0; s < 2; s++) {
            const base = chunk.slot * PER.band + sI * 8 + s * 4;
            const on = !skipCut && Math.random() < 0.7;
            const len = rand(6, 9);                 // short so straight slabs hug the bends
            const cz = zc + (-L / 2 + (s + 0.5) * L / 2) + rand(-3, 3);
            const off = Math.floor(Math.random() * 4);
            for (let b = 0; b < 4; b++) {
                if (!on) { hide(bands, base + b); continue; }
                const face = 9.6 + b * 0.45;
                pt(cz, side * (face + 1.5));
                put(bands, base + b, P.x, b * 1.3 + 0.64, P.z, 3, 1.32, len * (1 - 0.08 * b), P.h);
                colorHex(bands, base + b, STRATA_COLORS[(b + off) % 4]);
            }
        }

        // Painted stone barrier: wall, red stripe, alternating red/white posts
        const wBase = chunk.slot * PER.wall + sI * 9;
        for (let k = 0; k < 9; k++) {
            const z = zc - L / 2 + k * 4 + 2 + 0;                  // wall centres (multiples of 4)
            const off = side * T.BARRIER_X;
            pt(z, off);
            const sz = Math.min(1.8, 1 / Math.cos(P.h));       // keep wall segments joined on slanted road
            put(walls, wBase + k, P.x, 0, P.z, 1, 1, sz, P.h);
            colorHex(walls, wBase + k, WHITE);
            put(stripes, wBase + k, P.x, 0, P.z, 1, 1, sz, P.h);
            colorHex(stripes, wBase + k, RED);
            pt(z + 2, off);
            put(posts, wBase + k, P.x, 0, P.z, 1, 1, 1, P.h);
            colorHex(posts, wBase + k, (k & 1) ? RED : WHITE);
        }
        return fortHere;
    }

    function fillChunk(chunk, zc) {
        counter++;
        release(chunk.feature);
        chunk.feature = null;
        const n = counter;
        let ftype = null;
        if (n % T.WATERFALL_EVERY === 3) ftype = 'waterfall';
        else if (n % T.BRIDGE_EVERY === 8) ftype = 'bridge';
        else if (n % T.FORT_EVERY === 6) ftype = 'fort';
        const fside = Math.random() < 0.5 ? 1 : -1;

        fillSide(chunk, zc, -1, ftype, fside);
        fillSide(chunk, zc, 1, ftype, fside);

        if (ftype) {
            // Waterfall and bridge need a fairly straight stretch: pick the
            // straightest z in the chunk, and skip the piece on a tight bend
            const st = straightestZ(zc);
            const g = (ftype === 'fort' || st.turn < 0.2) ? acquire(ftype) : null;
            if (g) {
                chunk.feature = g;
                if (ftype === 'fort') {
                    pt(zc + rand(-6, 6), fside * rand(62, 82));
                    g.position.set(P.x, 0, P.z);
                    g.rotation.y = rand(0, 6.28);
                } else {
                    pt(st.z, 0);
                    g.position.set(P.x, 0, P.z);
                    g.rotation.y = ftype === 'waterfall' && fside < 0 ? P.h + Math.PI : P.h;
                }
            }
        }
        chunk.position.z = zc;
        dirty = true;
    }

    let dirty = false;
    function flush() {
        if (!dirty) return;
        dirty = false;
        for (const m of instances) {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
    }

    // ------------------------------------------------------------ signs
    const signRed = mat(0xE2605E), signCream = mat(0xFFF1D0), signDark = mat(0x4A4A5A), poleMat = mat(0xB8B2AA);
    function buildSign() {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), poleMat);
        pole.position.y = 1.3;
        g.add(pole);
        const plate = new THREE.Group();
        plate.position.y = 3.15;
        const tri = (r, mt, z) => {
            const geo = new THREE.CylinderGeometry(r, r, 0.06, 3);
            geo.rotateX(-Math.PI / 2);             // vertex at +y, thickness along z
            const m = new THREE.Mesh(geo, mt);
            m.position.z = z;
            plate.add(m);
        };
        tri(0.95, signRed, 0);
        tri(0.62, signCream, 0.04);
        const dark = (w, h, x, y) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), signDark);
            m.position.set(x, y, 0.09);
            plate.add(m);
        };
        dark(0.07, 0.34, -0.14, -0.03);
        dark(0.07, 0.34, 0.14, -0.03);
        dark(0.35, 0.07, 0, -0.2);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), signDark);
        head.position.set(-0.14, 0.2, 0.09);
        plate.add(head);
        g.add(plate);
        g.userData.plate = plate;
        return g;
    }
    const signs = [];
    for (let i = 0; i < T.SIGN_COUNT; i++) {
        const s = buildSign();
        s.userData.side = i % 2 ? 1 : -1;
        group.add(s);
        signs.push(s);
    }
    function placeSign(s, z) {
        s.userData.side = -s.userData.side;
        pt(z, s.userData.side * T.SIGN_X);
        s.position.set(P.x, 0, P.z);
        s.rotation.y = P.h - s.userData.side * 0.2;
    }

    // ------------------------------------------------------------ monkeys
    const fur = mat(0xC9A27A), furDark = mat(0xA9825E), skin = mat(0xF2C6B4);
    function buildMonkey() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur);
        body.scale.set(1, 1.15, 0.9);
        body.position.y = 0.24;
        g.add(body);
        const head = new THREE.Group();
        head.position.set(0, 0.55, 0.03);
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fur);
        head.add(skull);
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), skin);
        face.position.set(0, -0.015, 0.075);
        head.add(face);
        for (const s of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skin);
            ear.position.set(s * 0.14, 0, 0);
            head.add(ear);
            const arm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), furDark);
            arm.scale.set(0.8, 1.6, 0.8);
            arm.position.set(s * 0.19, 0.2, 0.08);
            g.add(arm);
        }
        g.add(head);
        const tail = new THREE.Group();
        tail.position.set(0, 0.12, -0.18);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 5), furDark);
        seg.position.y = 0.22;
        seg.rotation.x = -0.5;
        tail.add(seg);
        g.add(tail);
        g.userData = { head, tail, phase: rand(0, 6.28), side: 1 };
        return g;
    }
    const monkeys = [];
    for (let i = 0; i < T.MONKEY_COUNT; i++) {
        const m = buildMonkey();
        m.userData.side = i % 2 ? 1 : -1;
        group.add(m);
        monkeys.push(m);
    }
    function placeMonkey(m, z) {
        m.userData.side = Math.random() < 0.5 ? 1 : -1;
        pt(4 * Math.round(z / 4), m.userData.side * T.BARRIER_X);      // on a wall segment
        m.position.set(P.x, 0.7, P.z);
        m.rotation.y = P.h - m.userData.side * 0.6;
    }

    // ------------------------------------------------------------ fog patches
    const fogMat = new THREE.MeshBasicMaterial({ color: 0xEAF0FA, transparent: true, opacity: 0.32, depthWrite: false });
    const fogGeo = new THREE.IcosahedronGeometry(1, 1);
    const fogs = [];
    for (let i = 0; i < T.FOG_COUNT; i++) {
        const f = new THREE.Mesh(fogGeo, fogMat);
        f.userData = { baseX: 0, phase: rand(0, 6.28) };
        group.add(f);
        fogs.push(f);
    }
    function placeFog(f, z) {
        const side = Math.random() < 0.5 ? 1 : -1;
        pt(z, side * rand(11, 26));
        f.userData.baseX = P.x;
        f.scale.set(rand(5, 8), rand(0.9, 1.5), rand(7, 11));
        f.rotation.y = P.h;
        f.position.set(P.x, rand(1.0, 3.2), P.z);
    }

    // ------------------------------------------------------------ layout
    let time = 0;
    let weight = 0;
    let needsLayout = true;
    let busRef = bus;

    function layout(b) {
        const z0 = b ? b.position.z : 0;
        const base = L * Math.round(z0 / L);
        counter = Math.floor(Math.random() * 40);
        for (const c of chunks) { release(c.feature); c.feature = null; }
        for (let i = 0; i < CH; i++) fillChunk(chunks[i], base + L - i * L);
        signs.forEach((s, i) => placeSign(s, z0 + 20 - (i + Math.random()) * T.SIGN_GAP));
        monkeys.forEach((m, i) => placeMonkey(m, z0 - 10 - (i + Math.random()) * T.MONKEY_GAP));
        fogs.forEach((f, i) => placeFog(f, z0 + 20 - (i + Math.random()) * T.FOG_GAP));
        flush();
        needsLayout = false;
    }

    function setWeight(w) {
        weight = Math.max(0, Math.min(1, w || 0));
        const on = weight > 0.001;
        if (on && !group.visible) needsLayout = true;       // world moved while hidden
        group.visible = on;
        group.position.y = -T.SINK * (1 - smooth(weight));
        if (on && needsLayout && busRef) layout(busRef);
    }

    const placeChunk = (c, z) => fillChunk(c, z);
    const chunkGap = () => L;
    const signPlace = (s, z) => placeSign(s, z);
    const monkeyPlace = (m, z) => placeMonkey(m, z);
    const fogPlace = (f, z) => placeFog(f, z);
    const signGap = () => T.SIGN_GAP * rand(0.75, 1.25);
    const monkeyGap = () => T.MONKEY_GAP * rand(0.7, 1.3);
    const fogGap = () => T.FOG_GAP * rand(0.75, 1.25);

    function update(dt, b, w) {
        if (b) busRef = b;
        if (w !== undefined) setWeight(w);
        if (!group.visible) return;
        if (needsLayout) layout(busRef);
        const z = busRef ? busRef.position.z : 0;
        time += dt;

        recycleBehind(chunks, z, { behind: T.BEHIND, spacing: L, place: placeChunk, gapFor: chunkGap });
        recycleBehind(signs, z, { behind: 40, spacing: T.SIGN_GAP, place: signPlace, gapFor: signGap });
        recycleBehind(monkeys, z, { behind: 40, spacing: T.MONKEY_GAP, place: monkeyPlace, gapFor: monkeyGap });
        recycleBehind(fogs, z, { behind: 50, spacing: T.FOG_GAP, place: fogPlace, gapFor: fogGap });
        flush();

        // Ambient animation
        waterTex.offset.y += dt * 0.9;
        for (const g of pools.waterfall) {
            if (!g.visible) continue;
            const mist = g.userData.mist;
            for (let i = 0; i < mist.length; i++) {
                const m = mist[i], d = m.userData;
                const k = 1 + 0.15 * Math.sin(time * 1.3 + d.phase);
                m.scale.set(d.base * 1.4 * k, d.base * 0.8 * k, d.base * 1.4 * k);
                m.position.y = d.y + 0.25 * Math.sin(time * 0.8 + d.phase);
            }
        }
        for (const m of monkeys) {
            const d = m.userData;
            d.head.rotation.y = Math.sin(time * 1.7 + d.phase) * 0.5;
            d.head.rotation.x = Math.max(0, Math.sin(time * 0.6 + d.phase * 2)) * 0.25;
            d.tail.rotation.z = Math.sin(time * 2.2 + d.phase) * 0.4;
        }
        for (const f of fogs) {
            f.position.x = f.userData.baseX + Math.sin(time * 0.2 + f.userData.phase) * 1.5;
        }
    }

    return { group, update, setWeight };
}
