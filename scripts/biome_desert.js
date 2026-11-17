// =============================================
// DESERT BIOME - a Thar-style sand country beside the endless road
// Rolling peach dunes (smooth displaced tiles with a wind-ripple texture),
// khejri and acacia trees, cacti and thor bushes, camel caravans with walking
// legs, a camel cart, round jhonpa huts, chhatris, a heat-haze mirage strip,
// tumbleweeds and wind-blown sand.
//
// API: createDesertBiome({ scene, bus }) -> { group, update(dt, bus, weight), setWeight(w) }
//   weight 0 -> group hidden, 1 -> fully risen. In between the whole biome sinks
//   under the ground plane, so it grows out of the ground as it fades in.
// Everything is recycled around the bus (behind -> ahead). Props are merged,
// vertex-coloured, instanced meshes sharing a handful of materials.
// Tunables live in CFG below (mirrored in DESERT_BIOME in constants.js if added).
// =============================================

import * as THREE from 'three';
import { recycleBehind } from './endless.js';
import { makeSway } from './environment.js';
import { roadCenterX, roadHeading } from './roadpath.js';

const CFG = {
    TILE_L: 50,          // length of one dune tile (heights repeat every TILE_L)
    TILES: 9,            // tiles per side (visible range ~ (TILES - 2) * TILE_L ahead)
    X_NEAR: 7.8,         // terrain starts just beside the shoulder
    X_FAR: 92,
    SINK: 14,            // metres the biome hides below the ground at weight 0
    SAND_PARTICLES: 160,
    TUMBLEWEEDS: 7
};

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sgn = () => (Math.random() < 0.5 ? -1 : 1);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ geometry utils
const _c = new THREE.Color();

/** Paints every vertex of a geometry one colour. */
function colorize(geo, hex) {
    _c.set(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
}

/** Scale -> rotate -> translate a primitive, then colour it. */
function part(geo, hex, o = {}) {
    geo.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o.rx) geo.rotateX(o.rx);
    if (o.ry) geo.rotateY(o.ry);
    if (o.rz) geo.rotateZ(o.rz);
    geo.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    return colorize(geo, hex);
}

/** Merges coloured primitives into one indexed geometry. */
function merge(geos) {
    let vc = 0;
    let ic = 0;
    for (const g of geos) {
        vc += g.attributes.position.count;
        ic += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vc * 3);
    const nor = new Float32Array(vc * 3);
    const col = new Float32Array(vc * 3);
    const idx = new Uint32Array(ic);
    let vo = 0;
    let io = 0;
    for (const g of geos) {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        col.set(g.attributes.color.array, vo * 3);
        if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; }
        else { for (let i = 0; i < n; i++) idx[io++] = vo + i; }
        vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
}

// ------------------------------------------------------------------ terrain
// Everything is placed by LATERAL offset from the (bending) road centre line:
// world x = roadCenterX(z) + lat / cos(heading), so lat is the true
// perpendicular distance and |lat| > 8 is always clear of the road.
function roadX(z, lat) {
    return roadCenterX(z) + lat / Math.cos(roadHeading(z));
}

const L = CFG.TILE_L;
const K = TAU / L;

/** Dune height at lateral offset x (from the road centre) and depth z. Periodic in z with period TILE_L so tiles recycle seamlessly. */
function duneHeight(x, z) {
    const d = Math.abs(x);
    const s = x < 0 ? 1.7 : 0;
    const env = smooth(7.6, 24, d);
    const far = smooth(30, 90, d);
    const ridge = 0.5 * Math.sin(K * z + d * 0.11 + s)
        + 0.3 * Math.sin(K * 2 * z + d * 0.19 + 1.3 + s * 2)
        + 0.2 * Math.sin(K * 3 * z - d * 0.27 + 0.4);
    return 0.08 + env * (1.1 + ridge) * (1 + 2.8 * far);
}

const SAND_SHADE = new THREE.Color(0xE9A57C);
const SAND_MID = new THREE.Color(0xF7C99C);
const SAND_LIGHT = new THREE.Color(0xFFE6BE);

function sandColor(c, x, z, h, nx, nz) {
    const lit = clamp01(0.5 - nx * 1.2 - nz * 0.3);
    c.copy(SAND_SHADE).lerp(SAND_MID, Math.min(1, lit * 2));
    if (lit > 0.5) c.lerp(SAND_LIGHT, (lit - 0.5) * 2);
    c.lerp(SAND_LIGHT, smooth(0, 5, h) * 0.2);
}

/**
 * Builds one tile (L long, centred on z = 0) as a displaced grid with analytic
 * normals and baked vertex colours.
 */
function buildTile({ xs, side, nz, hFn, cFn, uvx, uvz }) {
    const nx = xs.length - 1;
    const vcount = (nx + 1) * (nz + 1);
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const col = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const e = 0.6;
    const c = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= nz; j++) {
        const z = -L / 2 + (L * j) / nz;
        for (let i = 0; i <= nx; i++) {
            const x = side * xs[i];
            const h = hFn(x, z);
            const hx = (hFn(x + e, z) - hFn(x - e, z)) / (2 * e);
            const hz = (hFn(x, z + e) - hFn(x, z - e)) / (2 * e);
            const inv = 1 / Math.hypot(hx, 1, hz);
            pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
            nor[k * 3] = -hx * inv; nor[k * 3 + 1] = inv; nor[k * 3 + 2] = -hz * inv;
            cFn(c, x, z, h, -hx * inv, -hz * inv);
            col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
            uv[k * 2] = xs[i] * uvx;
            uv[k * 2 + 1] = (z + L / 2) * uvz;
            k++;
        }
    }
    const idx = new Uint32Array(nx * nz * 6);
    let o = 0;
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            const a = j * (nx + 1) + i;
            const b = a + 1;
            const cc = a + nx + 1;
            const d = cc + 1;
            if (side > 0) { idx[o++] = a; idx[o++] = cc; idx[o++] = b; idx[o++] = b; idx[o++] = cc; idx[o++] = d; }
            else { idx[o++] = a; idx[o++] = b; idx[o++] = cc; idx[o++] = b; idx[o++] = d; idx[o++] = cc; }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
}

/** Tileable canvas texture of wind ripples (near white; multiplies the vertex colours). */
function createRippleTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    for (let y = 6; y < size; y += 10) {
        const phase = Math.random() * TAU;
        const amp = 2 + Math.random() * 2.5;
        ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(205,150,110,0.20)' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 8) {
            const yy = y + Math.sin((x / size) * TAU * 4 + phase) * amp;
            if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210,160,120,0.12)';
    for (let i = 0; i < 90; i++) ctx.fillRect(Math.random() * size, Math.random() * size, 2, 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// -------------------------------------------------------------- prop shapes
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);

function khejriGeo() {
    const parts = [
        part(cyl(0.14, 0.24, 2.4, 7), 0xB88C68, { y: 1.2, rz: 0.06 }),
        part(cyl(0.07, 0.11, 1.4, 6), 0xB88C68, { x: 0.55, y: 2.6, rz: -0.9 }),
        part(cyl(0.07, 0.11, 1.3, 6), 0xB88C68, { x: -0.5, y: 2.55, rz: 0.9 })
    ];
    const blobs = [[0, 3.6, 0, 1.5], [1.15, 3.35, 0.3, 1.0], [-1.1, 3.25, -0.3, 1.0], [0.3, 3.2, -1.0, 0.85], [-0.2, 4.15, 0.5, 0.8]];
    blobs.forEach(([x, y, z, r], i) => {
        parts.push(part(ico(r, 1), i % 2 ? 0xA9C98A : 0x93B97C, { x, y, z, sy: 0.55 }));
    });
    return merge(parts);
}

function acaciaGeo() {
    return merge([
        part(cyl(0.12, 0.22, 2.2, 7), 0xB0805E, { x: 0.15, y: 1.1, rz: -0.1 }),
        part(cyl(0.08, 0.13, 1.4, 6), 0xB0805E, { x: -0.35, y: 2.55, rz: 0.55 }),
        part(sph(2.6, 12, 6), 0x9DC77E, { x: 0.5, y: 3.2, sy: 0.2 }),
        part(sph(1.8, 10, 5), 0xB1D58C, { x: -0.9, y: 3.55, z: 0.5, sy: 0.22 }),
        part(sph(1.3, 10, 5), 0xA5CF86, { x: 1.7, y: 3.3, z: -0.6, sy: 0.22 })
    ]);
}

function cactusGeo() {
    const green = 0x8FCB9B;
    return merge([
        part(cyl(0.28, 0.3, 2.3, 8), green, { y: 1.15 }),
        part(sph(0.28, 8, 5), green, { y: 2.3 }),
        part(cyl(0.16, 0.16, 0.75, 7), green, { x: 0.5, y: 1.15, rz: Math.PI / 2 }),
        part(cyl(0.16, 0.16, 0.9, 7), green, { x: 0.85, y: 1.55 }),
        part(sph(0.16, 7, 4), green, { x: 0.85, y: 2.0 }),
        part(cyl(0.15, 0.15, 0.6, 7), green, { x: -0.42, y: 1.55, rz: Math.PI / 2 }),
        part(cyl(0.15, 0.15, 0.7, 7), green, { x: -0.72, y: 1.85 }),
        part(sph(0.15, 7, 4), green, { x: -0.72, y: 2.2 }),
        part(sph(0.07, 6, 4), 0xFF9CB8, { y: 2.55 })
    ]);
}

function thorGeo() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        parts.push(part(ico(0.45, 0), pick([0xC9BE84, 0xB9C48A, 0xD4C690]), {
            x: Math.cos(a) * 0.35, z: Math.sin(a) * 0.35, y: 0.3 + (i % 2) * 0.12, sy: 0.7
        }));
    }
    parts.push(part(ico(0.5, 0), 0xB4BD80, { y: 0.45, sy: 0.8 }));
    for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU);
        parts.push(part(new THREE.ConeGeometry(0.06, 0.6, 4), 0xDCCB8C, { x: Math.cos(a) * 0.7, z: Math.sin(a) * 0.7, y: 0.3, rz: Math.cos(a) * 0.3 }));
    }
    return merge(parts);
}

function huttGeo() {
    const hut = (x, z, s) => [
        part(cyl(1.7 * s, 1.8 * s, 0.14, 12), 0xF1CFA3, { x, z, y: 0.07 }),
        part(cyl(1.5 * s, 1.55 * s, 1.5 * s, 12), 0xE6B592, { x, z, y: 0.85 * s }),
        part(cyl(1.56 * s, 1.56 * s, 0.22 * s, 12), 0xD98F78, { x, z, y: 1.0 * s }),
        part(new THREE.ConeGeometry(2.2 * s, 1.9 * s, 12), 0xE9C778, { x, z, y: 2.45 * s }),
        part(new THREE.ConeGeometry(0.28 * s, 0.5 * s, 6), 0xD7AE5C, { x, z, y: 3.55 * s }),
        part(new THREE.BoxGeometry(0.6 * s, 0.95 * s, 0.2), 0x7A5240, { x, z: z + 1.5 * s, y: 0.55 * s })
    ];
    return merge([...hut(0, 0, 1), ...hut(3.1, -1.4, 0.7)]);
}

function chhatriGeo() {
    const stone = 0xF7E3C3;
    const pillars = [];
    [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([x, z]) => {
        pillars.push(part(cyl(0.2, 0.22, 2.6, 8), stone, { x, z, y: 2.1 }));
        pillars.push(part(sph(0.34, 8, 5), 0xFFD9B0, { x, z, y: 3.6 }));
        pillars.push(part(new THREE.ConeGeometry(0.1, 0.4, 6), 0xF2A6A0, { x, z, y: 4.1 }));
    });
    return merge([
        part(new THREE.BoxGeometry(6.4, 3.2, 6.4), 0xEED3AE, { y: -0.9 }),
        part(new THREE.BoxGeometry(5.6, 0.5, 5.6), stone, { y: 0.9 }),
        part(new THREE.BoxGeometry(4.8, 0.4, 4.8), 0xFFEBCF, { y: 1.35 }),
        ...pillars,
        part(new THREE.BoxGeometry(4.6, 0.35, 4.6), stone, { y: 3.55 }),
        part(sph(1.7, 14, 8), 0xFFDDB6, { y: 3.65, sy: 0.85 }),
        part(cyl(0.12, 0.12, 0.6, 6), 0xF2A6A0, { y: 5.4 }),
        part(sph(0.22, 8, 5), 0xF5C84C, { y: 5.8 })
    ]);
}

// Camel parts (all face +x, feet on y = 0, legs hang from pivots at y = 1.1)
function camelBodyGeo() {
    const fur = 0xE0AE72;
    const dark = 0xB98650;
    return merge([
        part(sph(0.5, 12, 8), fur, { y: 1.45, sx: 1.75, sy: 0.78, sz: 0.72 }),
        part(sph(0.3, 10, 6), 0xD59C5F, { x: -0.2, y: 1.98, sy: 1.15, sz: 0.9 }),
        part(cyl(0.13, 0.2, 0.95, 8), fur, { x: 0.92, y: 1.9, rz: -0.6 }),
        part(sph(0.17, 8, 6), fur, { x: 1.36, y: 2.36, sx: 1.6, sy: 0.9, sz: 0.85 }),
        part(sph(0.12, 8, 5), 0xF0CFA0, { x: 1.62, y: 2.28, sx: 1.2 }),
        part(sph(0.035, 5, 4), 0x40302A, { x: 1.43, y: 2.43, z: 0.11 }),
        part(sph(0.035, 5, 4), 0x40302A, { x: 1.43, y: 2.43, z: -0.11 }),
        part(new THREE.ConeGeometry(0.05, 0.16, 5), dark, { x: 1.25, y: 2.55, z: 0.1 }),
        part(new THREE.ConeGeometry(0.05, 0.16, 5), dark, { x: 1.25, y: 2.55, z: -0.1 }),
        part(cyl(0.035, 0.05, 0.65, 5), dark, { x: -0.98, y: 1.4, rz: 0.25 })
    ]);
}

function camelLegGeo() {
    return merge([
        part(cyl(0.085, 0.06, 1.1, 7), 0xD9A56E, { y: -0.55 }),
        part(sph(0.075, 6, 4), 0x5A4034, { y: -1.07, sx: 1.3, sy: 0.7 })
    ]);
}

function camelLoadGeo(blanket, rider) {
    const parts = [
        part(new THREE.BoxGeometry(0.6, 0.09, 1.0), blanket, { x: 0.5, y: 1.82 }),
        part(new THREE.BoxGeometry(0.62, 0.05, 0.3), 0xFFF2D0, { x: 0.5, y: 1.87 }),
        part(sph(0.26, 7, 5), 0xF3E5C8, { x: 0.5, y: 1.6, z: 0.52, sy: 1.2, sz: 0.7 }),
        part(sph(0.26, 7, 5), 0xE9D7B4, { x: 0.5, y: 1.6, z: -0.52, sy: 1.2, sz: 0.7 })
    ];
    if (rider) parts.push(...riderParts(0.5, 1.88, 0));
    return merge(parts);
}

function riderParts(x, y, z) {
    return [
        part(cyl(0.15, 0.17, 0.5, 8), 0xF4F0E0, { x, y: y + 0.27, z }),
        part(sph(0.12, 8, 6), 0xC58A63, { x, y: y + 0.62, z }),
        part(sph(0.15, 8, 6), 0xE0526A, { x, y: y + 0.72, z, sy: 0.8 })
    ];
}

function wheelGeo() {
    const parts = [part(cyl(0.6, 0.6, 0.1, 16), 0x8A5A3C, { rx: Math.PI / 2 })];
    for (let i = 0; i < 3; i++) {
        parts.push(part(new THREE.BoxGeometry(1.05, 0.08, 0.16), 0xF2D18A, { rz: (i / 3) * Math.PI, z: 0 }));
    }
    parts.push(part(cyl(0.12, 0.12, 0.22, 8), 0xC98F5D, { rx: Math.PI / 2 }));
    return merge(parts);
}

function cartBodyGeo() {
    const wood = 0xC98F5D;
    const parts = [
        part(new THREE.BoxGeometry(2.2, 0.14, 1.3), wood, { x: 0, y: 0.95 }),
        part(new THREE.BoxGeometry(2.2, 0.35, 0.08), 0xE0A36E, { x: 0, y: 1.2, z: 0.66 }),
        part(new THREE.BoxGeometry(2.2, 0.35, 0.08), 0xE0A36E, { x: 0, y: 1.2, z: -0.66 }),
        part(new THREE.BoxGeometry(0.08, 0.35, 1.3), 0xE0A36E, { x: -1.1, y: 1.2 }),
        part(cyl(0.05, 0.05, 3.6, 6), 0x8A5A3C, { x: 2.0, y: 1.0, z: 0.45, rz: Math.PI / 2 }),
        part(cyl(0.05, 0.05, 3.6, 6), 0x8A5A3C, { x: 2.0, y: 1.0, z: -0.45, rz: Math.PI / 2 }),
        part(cyl(0.06, 0.06, 1.0, 6), 0x8A5A3C, { x: 0, y: 0.6, rx: Math.PI / 2 }),
        part(new THREE.BoxGeometry(2.4, 0.08, 1.5), 0xE86A6A, { x: -0.1, y: 2.45 }),
        part(new THREE.BoxGeometry(2.4, 0.09, 0.4), 0xF5C84C, { x: -0.1, y: 2.46 })
    ];
    [[-1.0, 0.6], [1.0, 0.6], [-1.0, -0.6], [1.0, -0.6]].forEach(([x, z]) => {
        parts.push(part(cyl(0.04, 0.04, 1.5, 5), 0xA06F48, { x, y: 1.7, z }));
    });
    parts.push(...riderParts(-0.5, 1.02, 0.1));
    return merge(parts);
}

// ----------------------------------------------------------------- pools
const _dummy = new THREE.Object3D();

/**
 * A line of recycled items. Items are anything with a position.z (plain data
 * records for instanced props, groups for animated actors).
 */
function createPool({ items, count, spacing, place, flush, behind = 80, ahead = 60 }) {
    const list = items || Array.from({ length: count }, () => ({
        position: { x: 0, y: 0, z: 0 }, rot: 0, sx: 1, sy: 1, sz: 1, color: 0xFFFFFF
    }));
    const span = list.length * spacing;
    let ready = false;
    const layout = (busZ) => {
        list.forEach((it, i) => place(it, busZ + ahead - i * spacing - Math.random() * spacing * 0.5));
        if (flush) flush(list);
    };
    return {
        items: list,
        update(busZ) {
            if (!ready) { ready = true; layout(busZ); return; }
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const it of list) {
                const z = it.position.z;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
            }
            // The bus jumped (restart / long hidden stretch): lay the line out afresh
            if (minZ > busZ - span * 0.35 || maxZ < busZ - 150) { layout(busZ); return; }
            if (recycleBehind(list, busZ, { behind, spacing, place }) > 0 && flush) flush(list);
        }
    };
}

/** Makes an InstancedMesh from a merged geometry plus its matrix/colour writer. */
function makeInstanced(geo, material, count) {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.frustumCulled = false;
    _c.set(0xFFFFFF);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, _c);
    const flush = (items) => {
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            _dummy.position.set(it.position.x, it.position.y, it.position.z);
            _dummy.rotation.set(0, it.rot, 0);
            _dummy.scale.set(it.sx, it.sy, it.sz);
            _dummy.updateMatrix();
            mesh.setMatrixAt(i, _dummy.matrix);
            _c.set(it.color);
            mesh.setColorAt(i, _c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    return { mesh, flush };
}

// ============================================================ the biome
/**
 * @param {{scene: THREE.Object3D, bus: THREE.Object3D}} options
 * @returns {{group: THREE.Group, update: Function, setWeight: Function}}
 */
export function createDesertBiome({ scene, bus }) {
    const group = new THREE.Group();
    group.name = 'DesertBiome';
    group.visible = false;
    if (scene) scene.add(group);

    let weight = 0;
    let time = 0;
    const busZ0 = bus && bus.position ? bus.position.z : 0;

    // ------------------------------------------------------- dune tiles
    const sandMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: createRippleTexture(),
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2
    });
    const xs = [];
    const NX = 30;
    for (let i = 0; i <= NX; i++) xs.push(CFG.X_NEAR + (CFG.X_FAR - CFG.X_NEAR) * Math.pow(i / NX, 1.5));
    const tileGeos = [-1, 1].map(side => buildTile({
        xs, side, nz: 25, hFn: duneHeight, cFn: sandColor, uvx: 1 / 6, uvz: 1 / 6.25
    }));
    const tiles = [];
    // Each tile owns its position buffer (x is sheared along the road bend);
    // normals, colours, uvs and indices are shared with the base tile.
    const shearTile = (mesh) => {
        const base = mesh.userData.base.attributes.position.array;
        const arr = mesh.geometry.attributes.position.array;
        for (let j = 0; j <= 25; j++) {
            const zw = mesh.position.z - L / 2 + (L * j) / 25;
            const cx = roadCenterX(zw);
            const inv = 1 / Math.cos(roadHeading(zw));
            for (let i = 0; i <= NX; i++) {
                const k = (j * (NX + 1) + i) * 3;
                arr[k] = cx + base[k] * inv;
            }
        }
        mesh.geometry.attributes.position.needsUpdate = true;
    };
    for (let s = 0; s < 2; s++) {
        const base = tileGeos[s];
        for (let i = 0; i < CFG.TILES; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(base.attributes.position.array.slice(), 3));
            geo.setAttribute('normal', base.attributes.normal);
            geo.setAttribute('color', base.attributes.color);
            geo.setAttribute('uv', base.attributes.uv);
            geo.setIndex(base.index);
            const mesh = new THREE.Mesh(geo, sandMat);
            mesh.userData.base = base;
            mesh.position.z = Math.round(busZ0 / L) * L + L - i * L;
            mesh.frustumCulled = false;
            mesh.receiveShadow = true;
            shearTile(mesh);
            group.add(mesh);
            tiles.push(mesh);
        }
    }
    let shearTimer = 0;

    // ----------------------------------------- instanced, recycled props
    const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    const treeMat = makeSway(vcMat(), 0.014);
    const plainMat = vcMat();
    const bushMat = makeSway(vcMat(), 0.02);

    // x is the lateral offset from the road centre line
    const put = (it, lat, z, s, yOff = -0.05) => {
        it.position.x = roadX(z, lat);
        it.position.z = z;
        it.position.y = duneHeight(lat, z) + yOff;
        it.sx = it.sy = it.sz = s;
        it.rot = rand(0, TAU);
        return it;
    };

    const propPools = [];
    const addProps = (geo, material, count, spacing, placeFn) => {
        const { mesh, flush } = makeInstanced(geo, material, count);
        group.add(mesh);
        propPools.push(createPool({ count, spacing, place: placeFn, flush }));
    };

    const TREE_TINTS = [0xFFFFFF, 0xF3F0DC, 0xE6F0D0, 0xFFF0D8];
    addProps(khejriGeo(), treeMat, 28, 15, (it, z) => {
        put(it, sgn() * rand(10, 46), z, rand(0.8, 1.35));
        it.color = pick(TREE_TINTS);
    });
    addProps(acaciaGeo(), treeMat, 20, 21, (it, z) => {
        put(it, sgn() * rand(11, 52), z, rand(0.85, 1.4));
        it.color = pick(TREE_TINTS);
    });
    addProps(cactusGeo(), plainMat, 28, 13, (it, z) => {
        put(it, sgn() * rand(9.5, 34), z, rand(0.7, 1.3));
        it.color = pick([0xFFFFFF, 0xF2FFF2, 0xE8F8EC]);
    });
    addProps(thorGeo(), bushMat, 36, 10, (it, z) => {
        put(it, sgn() * rand(8.8, 40), z, rand(0.7, 1.5), -0.1);
        it.color = pick([0xFFFFFF, 0xF4EED8, 0xFFF4DA]);
    });
    addProps(huttGeo(), plainMat, 8, 46, (it, z) => {
        put(it, sgn() * rand(12, 22), z, rand(0.9, 1.15), -0.25);
        it.rot = roadHeading(z) + rand(-0.5, 0.5);
        it.color = pick([0xFFFFFF, 0xFFF4EA, 0xFBEBDD]);
    });

    // Sand drifting onto the edge of the shoulder: low flattened lumps, lifted
    // off the road surface (no coplanar faces) so they never z-fight.
    {
        const geo = colorize(new THREE.SphereGeometry(1, 12, 6), 0xF3CFA0);
        const { mesh, flush } = makeInstanced(geo, plainMat, 44);
        group.add(mesh);
        propPools.push(createPool({
            count: 44, spacing: 8, flush,
            place: (it, z) => {
                const side = sgn();
                const rx = rand(0.9, 2.2);
                const edge = 7.2 + rand(0, 0.5);
                it.position.x = roadX(z, side * (edge + rx));
                it.position.z = z;
                it.position.y = 0.0;
                it.sx = rx;
                it.sy = rand(0.07, 0.16);
                it.sz = rand(3, 8);
                it.rot = roadHeading(z) + rand(-0.12, 0.12);
                it.color = pick([0xFFFFFF, 0xFFEFD8, 0xFFE2C0]);
            }
        }));
    }

    // ---------------------------------------------------- chhatris
    const chhatriMat = vcMat();
    const chhatriGeometry = chhatriGeo();
    const chhatris = [];
    for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(chhatriGeometry, chhatriMat);
        m.frustumCulled = false;
        group.add(m);
        chhatris.push(m);
    }
    propPools.push(createPool({
        items: chhatris, spacing: 230, ahead: -60,
        place: (m, z) => {
            const lat = sgn() * rand(14, 20);
            m.position.set(roadX(z, lat), duneHeight(lat, z) + 0.3, z);
            m.rotation.y = roadHeading(z) + rand(-0.4, 0.4);
            m.scale.setScalar(rand(0.9, 1.2));
        }
    }));

    // ------------------------------------------ camels, caravans, cart
    const camelMat = vcMat();
    const bodyGeo = camelBodyGeo();
    const legGeo = camelLegGeo();
    const loadGeos = [0xE86A6A, 0x4FB6C9, 0xF2C14E].map(c => camelLoadGeo(c, false));
    const riderLoadGeo = camelLoadGeo(0xE86A6A, true);
    const LEG_POS = [[0.62, 0.25], [0.62, -0.25], [-0.62, 0.25], [-0.62, -0.25]];
    const LEG_PHASE = [0, Math.PI, Math.PI, 0];

    const makeCamel = (loadGeo) => {
        const root = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, camelMat);
        root.add(body);
        if (loadGeo) root.add(new THREE.Mesh(loadGeo, camelMat));
        const legs = LEG_POS.map(([x, z]) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, 1.1, z);
            pivot.add(new THREE.Mesh(legGeo, camelMat));
            root.add(pivot);
            return pivot;
        });
        root.scale.setScalar(1.15);
        return { root, body, legs, phase: rand(0, TAU) };
    };

    const walkers = [];
    const makeCaravan = (n) => {
        const g = new THREE.Group();
        const camels = [];
        for (let i = 0; i < n; i++) {
            const c = makeCamel(i === 0 ? riderLoadGeo : pick(loadGeos));
            c.lx = -i * 3.7;
            c.root.position.set(c.lx, 0, rand(-0.25, 0.25));
            g.add(c.root);
            camels.push(c);
        }
        g.userData = { camels, speed: rand(1.2, 1.6), dir: -1, wheels: [], cart: false };
        group.add(g);
        walkers.push(g);
        return g;
    };
    [4, 3, 4].forEach(makeCaravan);

    const wheelGeometry = wheelGeo();
    const cartGeometry = cartBodyGeo();
    const makeCart = () => {
        const g = new THREE.Group();
        const camel = makeCamel(null);
        camel.lx = 4.6;
        camel.root.position.set(4.6, 0, 0);
        g.add(camel.root);
        const cart = new THREE.Mesh(cartGeometry, camelMat);
        g.add(cart);
        const wheels = [0.75, -0.75].map(z => {
            const w = new THREE.Mesh(wheelGeometry, camelMat);
            w.position.set(0, 0.6, z);
            g.add(w);
            return w;
        });
        g.userData = { camels: [camel], speed: rand(1.8, 2.2), dir: -1, wheels, cart: true };
        group.add(g);
        walkers.push(g);
    };
    makeCart();
    makeCart();

    const walkerPool = createPool({
        items: walkers, spacing: 85, behind: 70, ahead: -20,
        place: (w, z) => {
            const dir = sgn();
            w.userData.dir = dir;
            w.userData.lat = sgn() * rand(11.5, 17);
            w.position.set(roadX(z, w.userData.lat), 0, z);
            w.rotation.y = -dir * Math.PI / 2 + roadHeading(z);
        }
    });

    const animateWalker = (w, dt) => {
        const u = w.userData;
        w.position.z += u.dir * u.speed * dt;
        // Follow the bend: stay at the same lateral offset, face along the road
        w.position.x = roadX(w.position.z, u.lat);
        w.rotation.y = -u.dir * Math.PI / 2 + roadHeading(w.position.z);
        const gait = u.speed * 3.2;
        for (const c of u.camels) {
            const p = time * gait + c.phase;
            for (let k = 0; k < 4; k++) c.legs[k].rotation.z = Math.sin(p + LEG_PHASE[k]) * 0.45;
            const wz = w.position.z + u.dir * c.lx;
            c.root.position.y = duneHeight(u.lat, wz) - 0.02 + Math.abs(Math.sin(p)) * 0.03;
            c.body.rotation.z = Math.sin(p * 2) * 0.015;
        }
        if (u.cart) {
            const spin = (u.speed * dt) / 0.6;
            u.wheels[0].rotation.z -= spin;
            u.wheels[1].rotation.z -= spin;
        }
    };

    // ----------------------------------------------------- tumbleweeds
    const tumbleMat = new THREE.MeshLambertMaterial({ color: 0xC9A56B, wireframe: true });
    const tumbleGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const tumbles = [];
    const respawnTumble = (t, busZ, first) => {
        const left = t.userData.left;
        t.userData.x = left ? rand(-62, -22) : rand(10, 40);
        if (!first) t.userData.x = left ? rand(-62, -40) : rand(9.5, 14);
        t.userData.z = busZ - rand(first ? 5 : 30, 140);
        t.userData.vx = rand(3, 6);
        t.userData.vz = rand(-1, 1);
        t.userData.hop = rand(0, TAU);
    };
    for (let i = 0; i < CFG.TUMBLEWEEDS; i++) {
        const t = new THREE.Mesh(tumbleGeo, tumbleMat);
        t.userData = { left: i % 2 === 0, x: 0, z: 0, vx: 4, vz: 0, hop: 0 };
        t.scale.setScalar(0.0001);
        t.frustumCulled = false;
        group.add(t);
        tumbles.push(t);
    }
    let tumblesReady = false;

    // ------------------------------------------------ wind-blown sand
    const N = CFG.SAND_PARTICLES;
    const sandPos = new Float32Array(N * 3);
    const sandSpeed = new Float32Array(N);
    const sandBase = new Float32Array(N);
    const sandPhase = new Float32Array(N);
    const sandGeo = new THREE.BufferGeometry();
    sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
    const sandPointsMat = new THREE.PointsMaterial({
        color: 0xF4D3A6, size: 0.3, transparent: true, opacity: 0, depthWrite: false
    });
    const sandPoints = new THREE.Points(sandGeo, sandPointsMat);
    sandPoints.frustumCulled = false;
    group.add(sandPoints);
    let sandReady = false;

    // ----------------------------------------------------- mirage strip
    const mirageMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uWeight: { value: 0 } },
        vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 p = position;
                p.x += sin(p.y * 2.5 + uTime * 1.7) * 0.8;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: `
            uniform float uTime;
            uniform float uWeight;
            varying vec2 vUv;
            void main() {
                float band = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
                float wob = sin(vUv.x * 160.0 + uTime * 1.3 + sin(vUv.x * 41.0 + uTime * 0.7) * 2.0) * 0.5 + 0.5;
                float streak = sin(vUv.x * 22.0 - uTime * 0.5 + vUv.y * 6.0) * 0.5 + 0.5;
                float a = band * (0.04 + 0.13 * wob * streak) * uWeight;
                gl_FragColor = vec4(1.0, 0.92, 0.8, a);
            }`
    });
    const mirage = new THREE.Mesh(new THREE.PlaneGeometry(700, 14), mirageMat);
    mirage.renderOrder = 2;
    mirage.frustumCulled = false;
    group.add(mirage);

    // ------------------------------------------------------------ control
    function setWeight(w) {
        weight = clamp01(w);
        group.visible = weight > 0.01;
        const e = weight * weight * (3 - 2 * weight);
        group.position.y = -(1 - e) * CFG.SINK;
        mirageMat.uniforms.uWeight.value = e;
    }

    function update(dt, busObj, w) {
        if (w !== undefined) setWeight(w);
        if (!group.visible) return;
        const b = busObj || bus;
        if (!b || !b.position) return;
        const bz = b.position.z;
        const bx = b.position.x;
        time += dt;

        // Dune tiles hop from behind to the far end (heights repeat every L)
        const lo = -(CFG.TILES - 1.5) * L;
        const hi = 1.5 * L;
        for (const t of tiles) {
            let guard = 0;
            const before = t.position.z;
            while (t.position.z - bz > hi && guard++ < 40) t.position.z -= CFG.TILES * L;
            while (t.position.z - bz < lo && guard++ < 80) t.position.z += CFG.TILES * L;
            if (t.position.z !== before) shearTile(t);
        }
        // The road path may gain straight zones later: re-fit every tile now and then
        shearTimer += dt;
        if (shearTimer > 2) { shearTimer = 0; for (const t of tiles) shearTile(t); }

        for (const p of propPools) p.update(bz);
        walkerPool.update(bz);
        for (const w2 of walkers) animateWalker(w2, dt);

        // Tumbleweeds roll downwind (+x), hopping now and then
        for (const t of tumbles) {
            const u = t.userData;
            if (!tumblesReady || u.z > bz + 60 || (u.left ? u.x > -9.5 : u.x > 60)) respawnTumble(t, bz, !tumblesReady);
            u.x += u.vx * dt;
            u.z += u.vz * dt;
            u.hop += dt * 5;
            const hopH = Math.max(0, Math.sin(u.hop)) * 0.5;
            const edge = u.left ? smooth(-9.5, -13, u.x) : smooth(9.5, 13, u.x);
            const fade = Math.min(edge, 1 - smooth(48, 60, Math.abs(u.x)), 1);
            t.scale.setScalar(Math.max(0.0001, fade * 0.9));
            t.position.set(roadX(u.z, u.x), duneHeight(u.x, u.z) + 0.4 + hopH, u.z);
            t.rotation.z -= (u.vx * dt) / 0.45;
            t.rotation.x += dt * 0.8;
        }
        tumblesReady = true;

        // Gusty wind carrying sand across the road
        const gust = Math.max(0, Math.sin(time * 0.33) * Math.sin(time * 0.11 + 1.0));
        const e = weight * weight * (3 - 2 * weight);
        sandPointsMat.opacity = Math.min(0.6, gust * 0.9) * e;
        sandPoints.visible = sandPointsMat.opacity > 0.02;
        if (sandPoints.visible || !sandReady) {
            for (let i = 0; i < N; i++) {
                const k = i * 3;
                if (!sandReady) {
                    sandPos[k] = bx + rand(-45, 45);
                    sandPos[k + 2] = bz + rand(-120, 30);
                    sandBase[i] = rand(0.3, 3.2);
                    sandSpeed[i] = rand(7, 15);
                    sandPhase[i] = rand(0, TAU);
                }
                sandPos[k] += sandSpeed[i] * (0.4 + gust) * dt;
                if (sandPos[k] > bx + 45) sandPos[k] -= 90;
                if (sandPos[k + 2] > bz + 30) sandPos[k + 2] -= 150;
                else if (sandPos[k + 2] < bz - 125) sandPos[k + 2] += 150;
                sandPos[k + 1] = sandBase[i] + Math.sin(time * 2 + sandPhase[i]) * 0.35;
            }
            sandReady = true;
            sandGeo.attributes.position.needsUpdate = true;
        }

        mirage.position.set(roadCenterX(bz - 240), 1.8, bz - 240);
        mirageMat.uniforms.uTime.value = time;
    }

    setWeight(0);
    return { group, update, setWeight };
}
