// =============================================
// COAST BIOME - a seaside road
// Sea on the LEFT of the road (negative lateral offset): a wave-animated
// glossy turquoise -> deep blue water (vertex shader), a foam line lapping the
// shore, a sandy beach with beach huts and umbrellas, coconut palms, fishing
// boats, rocks with splashing foam, a lighthouse with a rotating beam, a jetty
// and circling seagulls. On the RIGHT: soft green coastal hills with palms,
// broadleaf trees and flowering bushes.
//
// API: createCoastBiome({ scene, bus }) -> { group, update(dt, bus, weight), setWeight(w) }
//   weight 0 -> hidden, 1 -> full. In between the biome sinks beneath the
//   ground plane (so it rises out of the ground as it fades in).
//
// The road bends (scripts/roadpath.js), so everything is positioned by LATERAL
// offset from the road centre: x = roadCenterX(z) + lat / cos(heading).
// The sea, beach, foam and hill tiles are re-fitted to the bend whenever they
// are recycled. The shore sits ~26 m from the centre line, the sea plane is
// at y = 0.02 (below the road at 0.03, above the ground at 0; polygon offsets
// keep it from flickering) and |lat| < 8 is always clear.
// =============================================

import * as THREE from 'three';
import { recycleBehind } from './endless.js';
import { makeSway } from './environment.js';
import { roadCenterX, roadHeading } from './roadpath.js';

const CFG = {
    TILE_L: 50,
    TILES: 9,
    SINK: 12,
    SEA_Y: 0.02,         // mean sea level (road is 0.03, ground 0)
    SHORE: 26,           // lateral distance of the waterline from the road centre
    SEA_FAR: 160,
    GREEN_FAR: 90
};

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ geometry utils
const _c = new THREE.Color();

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

/** Merges coloured primitives (position, normal, color) into one geometry. */
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

const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// -------------------------------------------------------------- road helpers
// lat is the true perpendicular distance from the (bending) road centre line;
// negative = left (the sea side), positive = right (the green hills).
function roadX(z, lat) {
    return roadCenterX(z) + lat / Math.cos(roadHeading(z));
}
/** yaw that makes a +x-facing model point away from the road (outward). */
const outward = (lat, h) => h + (lat < 0 ? Math.PI : 0);

// ------------------------------------------------------------------ terrain
const L = CFG.TILE_L;
const K = TAU / L;

/** Waterline distance from the road centre at depth z (periodic in L). */
function shoreD(z) {
    return CFG.SHORE + 1.8 * Math.sin(K * z + 0.7) + 1.0 * Math.sin(K * 3 * z + 2.0);
}

/** Beach / seabed height at lateral offset lat (negative) and depth z. */
function beachH(lat, z) {
    const d = Math.abs(lat);
    const S = shoreD(z);
    if (d <= S) {
        const t = (S - d) / (S - 7.8);
        return 0.02 + 0.16 * Math.pow(t, 1.3) + 0.025 * Math.sin(d * 1.3 + z * 0.4) * t;
    }
    return 0.02 - (d - S) * 0.06;
}

/** Soft green coastal hills (lat positive). */
function greenH(lat, z) {
    const d = Math.abs(lat);
    const env = smooth(7.6, 22, d);
    const far = smooth(35, 85, d);
    const ridge = 0.5 * Math.sin(K * z + d * 0.09 + 0.5)
        + 0.3 * Math.sin(K * 2 * z + d * 0.16 + 2.1)
        + 0.2 * Math.sin(K * 3 * z - d * 0.21 + 1.0);
    return 0.06 + env * (0.7 + 0.6 * ridge) * (1 + 2.2 * far);
}

const groundH = (lat, z) => (lat < 0 ? beachH(lat, z) : greenH(lat, z));

const SAND_DRY = new THREE.Color(0xFFE2B0);
const SAND_WET = new THREE.Color(0xE6BE92);
const SAND_UNDER = new THREE.Color(0xC9A67E);
function beachColor(c, x, z, h, nx, nz) {
    const d = Math.abs(x);
    const S = shoreD(z);
    const wet = smooth(S - 4.5, S - 0.3, d);
    c.copy(SAND_DRY).lerp(SAND_WET, wet);
    if (d > S) c.lerp(SAND_UNDER, smooth(S, S + 3, d));
    c.multiplyScalar(0.92 + 0.08 * Math.sin(d * 0.9 + z * 0.6));
}

const GRASS_A = new THREE.Color(0xA9E07A);
const GRASS_B = new THREE.Color(0x8EDDA8);
const GRASS_L = new THREE.Color(0xC9F0A0);
function greenColor(c, x, z, h, nx, nz) {
    const patch = 0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * K * 2) * 1.5);
    c.copy(GRASS_A).lerp(GRASS_B, patch);
    c.lerp(GRASS_L, clamp01(0.35 - nx * 0.6) * 0.5 + smooth(0, 5, h) * 0.15);
}

/**
 * One tile (L long, centred on local z = 0) as a displaced grid. Lateral x
 * (xs, signed by `side`) is stored in the position buffer; the biome shears
 * it along the road bend each time the tile is recycled. Normals / colours
 * are baked from the height function. `aLat` carries the |lateral| distance.
 */
function buildTile({ xs, side, nz, hFn, cFn, uvx, uvz }) {
    const nx = xs.length - 1;
    const vcount = (nx + 1) * (nz + 1);
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const col = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const lat = new Float32Array(vcount);
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
            lat[k] = xs[i];
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
    geo.setAttribute('aLat', new THREE.BufferAttribute(lat, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
}

/** A thin strip that follows the waterline (cols = offsets from the shore, metres, seaward positive). */
function buildRibbon(cols, nz) {
    const nx = cols.length - 1;
    const vcount = (nx + 1) * (nz + 1);
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    let k = 0;
    for (let j = 0; j <= nz; j++) {
        const z = -L / 2 + (L * j) / nz;
        const S = shoreD(z);
        for (let i = 0; i <= nx; i++) {
            pos[k * 3] = -(S + cols[i]); pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z;
            nor[k * 3 + 1] = 1;
            uv[k * 2] = i / nx;
            uv[k * 2 + 1] = (z + L / 2) / 6.25;
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
            idx[o++] = a; idx[o++] = b; idx[o++] = cc; idx[o++] = b; idx[o++] = d; idx[o++] = cc;
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
}

/** Lacy foam pattern (green channel is used as alpha). */
function createFoamTexture() {
    const w = 128;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    // Soft bands across the strip (wrap horizontally so scrolling is seamless)
    for (let x = 0; x < w; x += 2) {
        const t = x / w;
        const v = Math.pow(Math.max(0, Math.sin(t * TAU * 2)), 1.5);
        const g = Math.floor(255 * (0.25 + 0.75 * v));
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(x, 0, 2, h);
    }
    // Lace: dark holes and bright bubbles along the strip
    for (let i = 0; i < 260; i++) {
        ctx.fillStyle = Math.random() < 0.55 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.8)';
        const s = 2 + Math.random() * 5;
        ctx.fillRect(Math.random() * w, Math.random() * h, s, s * 0.7);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// ------------------------------------------------------------------ the sea
const seaTime = { value: 0 };

function createSeaMaterial() {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.16,
        metalness: 0.05,
        emissive: 0x06303f,
        emissiveIntensity: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2
    });
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSeaTime = seaTime;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                attribute float aLat;
                uniform float uSeaTime;
                varying float vOff;
                varying float vH;`)
            .replace('#include <beginnormal_vertex>', `
                vec2 seaP = (modelMatrix * vec4(position, 1.0)).xz;
                float seaAmp = 0.035 + 0.2 * smoothstep(26.0, 90.0, aLat);
                float seaH = 0.0;
                vec2 seaG = vec2(0.0);
                {
                    vec2 d = vec2(0.80, 0.60); float k = 0.35;
                    float ph = dot(d, seaP) * k + uSeaTime * 1.1;
                    seaH += sin(ph) * 0.55; seaG += d * k * cos(ph) * 0.55;
                }
                {
                    vec2 d = vec2(-0.50, 0.85); float k = 0.62;
                    float ph = dot(d, seaP) * k + uSeaTime * 1.6;
                    seaH += sin(ph) * 0.30; seaG += d * k * cos(ph) * 0.30;
                }
                {
                    vec2 d = vec2(0.20, -1.00); float k = 1.30;
                    float ph = dot(d, seaP) * k + uSeaTime * 2.2;
                    seaH += sin(ph) * 0.15; seaG += d * k * cos(ph) * 0.15;
                }
                vec3 objectNormal = normalize(vec3(-seaG.x * seaAmp, 1.0, -seaG.y * seaAmp));
                #ifdef USE_TANGENT
                    vec3 objectTangent = vec3(tangent.xyz);
                #endif`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                transformed.y += seaH * seaAmp;
                vOff = aLat;
                vH = seaH;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying float vOff;
                varying float vH;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                float seaT = smoothstep(26.0, 110.0, vOff);
                vec3 seaShallow = vec3(0.05, 0.74, 0.68);
                vec3 seaMid = vec3(0.02, 0.42, 0.70);
                vec3 seaDeep = vec3(0.01, 0.12, 0.45);
                diffuseColor.rgb = mix(seaShallow, seaMid, smoothstep(0.0, 0.45, seaT));
                diffuseColor.rgb = mix(diffuseColor.rgb, seaDeep, smoothstep(0.35, 1.0, seaT));
                diffuseColor.rgb += vec3(0.55) * smoothstep(0.80, 1.0, vH) * (0.25 + 0.75 * seaT);`);
    };
    mat.customProgramCacheKey = () => 'coast-sea';
    return mat;
}

// -------------------------------------------------------------- prop shapes
/** A bent, tapered trunk built ring by ring along a parabola. */
function trunkGeo(H, bend, r0, r1, seg = 7, sides = 7) {
    const vc = (seg + 1) * sides;
    const pos = new Float32Array(vc * 3);
    const nor = new Float32Array(vc * 3);
    const col = new Float32Array(vc * 3);
    const idx = [];
    for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const cx = bend * t * t;
        const cy = H * t;
        let tx = 2 * bend * t;
        let ty = H;
        const len = Math.hypot(tx, ty);
        tx /= len; ty /= len;
        const n2x = ty;
        const n2y = -tx;
        const r = r0 + (r1 - r0) * t;
        _c.set(i % 2 ? 0xC9A27A : 0xB88C68);
        for (let s = 0; s < sides; s++) {
            const a = (s / sides) * TAU;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const k = (i * sides + s) * 3;
            pos[k] = cx + r * sa * n2x; pos[k + 1] = cy + r * sa * n2y; pos[k + 2] = r * ca;
            nor[k] = sa * n2x; nor[k + 1] = sa * n2y; nor[k + 2] = ca;
            col[k] = _c.r; col[k + 1] = _c.g; col[k + 2] = _c.b;
        }
    }
    for (let i = 0; i < seg; i++) {
        for (let s = 0; s < sides; s++) {
            const a = i * sides + s;
            const b = i * sides + ((s + 1) % sides);
            idx.push(a, b, a + sides, b, b + sides, a + sides);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return g;
}

/** One drooping palm leaf (a V-shaped strip), growing out from the origin. */
function frondGeo(phi, hex) {
    const segs = 6;
    const vc = (segs + 1) * 3;
    const pos = new Float32Array(vc * 3);
    const nor = new Float32Array(vc * 3);
    const col = new Float32Array(vc * 3);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const base = new THREE.Color(hex);
    const rib = base.clone().lerp(new THREE.Color(0xFFFFFF), 0.18);
    for (let k = 0; k <= segs; k++) {
        const u = k / segs;
        const out = 0.1 + u * 3.1;
        const y = 1.1 * u * (1.15 - 1.7 * u);
        const w = 0.62 * Math.sin(Math.PI * (0.12 + 0.88 * u));
        for (let s = 0; s < 3; s++) {
            const off = (s - 1) * w;
            const yy = y - (s === 1 ? 0 : 0.3 * w);
            const n = (k * 3 + s) * 3;
            pos[n] = cp * out - sp * off;
            pos[n + 1] = yy;
            pos[n + 2] = sp * out + cp * off;
            nor[n + 1] = 1;
            const cc = s === 1 ? rib : base;
            col[n] = cc.r; col[n + 1] = cc.g; col[n + 2] = cc.b;
        }
    }
    const idx = [];
    for (let k = 0; k < segs; k++) {
        for (let s = 0; s < 2; s++) {
            const a = k * 3 + s;
            const b = a + 1;
            const c = a + 3;
            const d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return g;
}

function palmGeo() {
    const H = 6.2;
    const bend = 1.7;
    const parts = [trunkGeo(H, bend, 0.3, 0.16)];
    const greens = [0x7FD68F, 0x93E09E, 0x6CCB86];
    for (let i = 0; i < 8; i++) {
        const f = frondGeo((i / 8) * TAU + rand(-0.15, 0.15), greens[i % 3]);
        f.translate(bend, H + 0.05, 0);
        parts.push(f);
    }
    [[0.25, -0.2, 0.1], [-0.15, -0.25, 0.2], [0.05, -0.2, -0.25]].forEach(([x, y, z]) => {
        parts.push(part(sph(0.2, 7, 5), 0x9C6B4A, { x: bend + x, y: H + y, z }));
    });
    return merge(parts);
}

function broadleafGeo() {
    return merge([
        part(cyl(0.2, 0.32, 3.0, 7), 0xC49A74, { y: 1.5 }),
        part(ico(1.7, 1), 0xA9E07A, { y: 4.1, sy: 0.9 }),
        part(ico(1.2, 1), 0x8EDDA8, { x: 1.2, y: 3.5, z: 0.3 }),
        part(ico(1.15, 1), 0xB6E88C, { x: -1.1, y: 3.7, z: -0.4 }),
        part(ico(1.0, 1), 0x9BE08C, { x: 0.2, y: 5.2, z: 0.2 })
    ]);
}

function bushGeo(main, flower) {
    const parts = [
        part(ico(0.7, 1), main, { sy: 0.75, y: 0.5 }),
        part(ico(0.55, 1), main, { x: 0.6, z: 0.2, y: 0.38, sy: 0.8 }),
        part(ico(0.5, 1), main, { x: -0.55, z: -0.2, y: 0.36, sy: 0.8 })
    ];
    for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU);
        const r = rand(0.2, 0.75);
        parts.push(part(sph(0.1, 5, 4), flower, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: rand(0.55, 0.95) }));
    }
    return merge(parts);
}

function hutGeo(roof, wall) {
    return merge([
        part(box(3.2, 0.22, 2.8), 0xC9A27A, { y: 0.35 }),
        part(box(2.2, 1.6, 1.8), wall, { y: 1.26 }),
        part(box(2.3, 0.2, 1.9), 0xFFFFFF, { y: 2.1 }),
        part(new THREE.ConeGeometry(1.7, 1.1, 4), roof, { y: 2.75, ry: Math.PI / 4, sx: 1.05, sz: 0.85 }),
        part(box(0.55, 1.0, 0.1), 0x7A5240, { y: 1.0, z: 0.93, x: -0.4 }),
        part(box(0.55, 0.5, 0.1), 0xBFEFFF, { y: 1.5, z: 0.93, x: 0.55 }),
        part(cyl(0.07, 0.07, 1.5, 5), 0xA06F48, { x: -1.4, y: 1.0, z: 1.25 }),
        part(cyl(0.07, 0.07, 1.5, 5), 0xA06F48, { x: 1.4, y: 1.0, z: 1.25 }),
        part(box(3.1, 0.12, 0.9), roof, { y: 1.8, z: 1.35 })
    ]);
}

function umbrellaGeo() {
    return merge([
        part(cyl(0.04, 0.04, 2.2, 5), 0xF3E5C8, { y: 1.1 }),
        part(new THREE.ConeGeometry(1.2, 0.5, 10), 0xFFFFFF, { y: 2.3 }),
        part(sph(0.06, 5, 4), 0xF3E5C8, { y: 2.6 }),
        part(box(0.8, 0.05, 1.7), 0xFFF0E0, { x: 1.4, y: 0.04, z: 0.2 })
    ]);
}

function rockGeo() {
    return merge([
        part(ico(0.9, 1), 0xD9C6BA, { y: 0.35, sy: 0.85 }),
        part(ico(0.6, 1), 0xCDBBB4, { x: 0.9, y: 0.15, z: 0.3 }),
        part(ico(0.5, 1), 0xE6D5C8, { x: -0.7, y: 0.1, z: -0.5 }),
        part(cyl(1.9, 2.1, 0.05, 16), 0xF4FFFF, { y: 0.12 })
    ]);
}

function boatGeo(hull, cabin) {
    return merge([
        part(sph(1, 12, 8), hull, { y: 0.15, sx: 2.2, sy: 0.55, sz: 0.85 }),
        part(new THREE.ConeGeometry(0.62, 1.0, 6), hull, { x: 2.35, y: 0.3, rz: -Math.PI / 2, sz: 0.8 }),
        part(box(3.6, 0.07, 1.25), 0xFFF3DC, { y: 0.55 }),
        part(box(0.95, 0.65, 0.8), cabin, { x: -0.6, y: 0.9 }),
        part(box(1.1, 0.07, 0.95), 0xFFFFFF, { x: -0.6, y: 1.25 }),
        part(cyl(0.05, 0.05, 2.4, 5), 0x8A5A3C, { x: 0.8, y: 1.7 }),
        part(new THREE.ConeGeometry(0.28, 0.6, 3), 0xFF6B6B, { x: 1.05, y: 2.7, rz: -Math.PI / 2 }),
        part(box(3.8, 0.1, 0.1), 0xFFFFFF, { y: 0.34, z: 0.7 })
    ]);
}

function lighthouseGeo() {
    const parts = [
        part(ico(2.6, 1), 0xCFC1B6, { y: 0.2, sy: 0.55 }),
        part(ico(1.6, 1), 0xD9C6BA, { x: 2.0, y: 0.1, z: 0.6, sy: 0.6 }),
        part(ico(1.4, 1), 0xE6D5C8, { x: -1.8, y: 0.1, z: -0.8, sy: 0.6 })
    ];
    for (let i = 0; i < 4; i++) {
        const rb = 1.55 - i * 0.16;
        parts.push(part(cyl(rb - 0.16, rb, 3.0, 14), i % 2 ? 0xFFF6EA : 0xFF7A7A, { y: 1.5 + i * 3.0 }));
    }
    parts.push(part(cyl(1.45, 1.3, 0.28, 14), 0x6D5A66, { y: 12.1 }));
    [0, 1, 2, 3].forEach(i => {
        const a = (i / 4) * TAU + Math.PI / 4;
        parts.push(part(cyl(0.06, 0.06, 1.5, 5), 0x6D5A66, { x: Math.cos(a) * 0.8, z: Math.sin(a) * 0.8, y: 12.95 }));
    });
    parts.push(part(new THREE.ConeGeometry(1.1, 0.9, 14), 0xFF7A7A, { y: 14.1 }));
    parts.push(part(sph(0.15, 6, 4), 0xF5C84C, { y: 14.65 }));
    return merge(parts);
}

function jettyGeo() {
    const parts = [];
    for (let i = 0; i < 28; i++) {
        parts.push(part(box(0.96, 0.12, 2.2), i % 2 ? 0xC49A74 : 0xD0A882, { x: 0.5 + i, y: 0.55 }));
    }
    for (let i = 0; i <= 9; i++) {
        [-1.0, 1.0].forEach(z => parts.push(part(cyl(0.13, 0.13, 1.9, 6), 0x8A5A3C, { x: 0.5 + i * 3, y: 0.0, z })));
    }
    parts.push(part(box(4, 0.14, 4), 0xC49A74, { x: 30, y: 0.55 }));
    [[28.2, -1.7], [28.2, 1.7], [31.8, -1.7], [31.8, 1.7]].forEach(([x, z]) => {
        parts.push(part(cyl(0.13, 0.13, 1.9, 6), 0x8A5A3C, { x, y: 0.0, z }));
    });
    parts.push(part(cyl(0.06, 0.06, 1.8, 5), 0x6D5A66, { x: 31.5, y: 1.5, z: 1.6 }));
    parts.push(part(sph(0.2, 6, 5), 0xFFE9A0, { x: 31.5, y: 2.5, z: 1.6 }));
    return merge(parts);
}

function gullParts() {
    const white = 0xFFFFFF;
    const body = merge([
        part(sph(0.3, 8, 6), white, { sx: 1.6, sy: 0.55, sz: 0.55 }),
        part(sph(0.13, 6, 5), white, { x: 0.45, y: 0.05 }),
        part(new THREE.ConeGeometry(0.05, 0.2, 5), 0xFFC857, { x: 0.62, y: 0.03, rz: -Math.PI / 2 }),
        part(box(0.3, 0.03, 0.25), 0xE8EEF2, { x: -0.5 })
    ]);
    const wing = (sign) => merge([
        part(box(0.3, 0.03, 0.9), white, { x: -0.05, z: sign * 0.5 }),
        part(box(0.22, 0.03, 0.3), 0x6F8090, { x: -0.1, z: sign * 1.05 })
    ]);
    return { body, left: wing(1), right: wing(-1) };
}

// ----------------------------------------------------------------- pools
const _dummy = new THREE.Object3D();

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
export function createCoastBiome({ scene, bus }) {
    const group = new THREE.Group();
    group.name = 'CoastBiome';
    group.visible = false;
    if (scene) scene.add(group);

    let weight = 0;
    let time = 0;
    const busZ0 = bus && bus.position ? bus.position.z : 0;

    // --------------------------------------------------- sheared tiles
    const tiles = [];
    const shearTile = (mesh) => {
        const { base, nx, nz } = mesh.userData;
        const src = base.attributes.position.array;
        const arr = mesh.geometry.attributes.position.array;
        for (let j = 0; j <= nz; j++) {
            const zw = mesh.position.z - L / 2 + (L * j) / nz;
            const cx = roadCenterX(zw);
            const inv = 1 / Math.cos(roadHeading(zw));
            for (let i = 0; i <= nx; i++) {
                const k = (j * (nx + 1) + i) * 3;
                arr[k] = cx + src[k] * inv;
            }
        }
        mesh.geometry.attributes.position.needsUpdate = true;
    };
    const addTiles = (base, material, nx, nz, y, order = 0) => {
        for (let i = 0; i < CFG.TILES; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(base.attributes.position.array.slice(), 3));
            for (const name of ['normal', 'color', 'uv', 'aLat']) {
                if (base.attributes[name]) geo.setAttribute(name, base.attributes[name]);
            }
            geo.setIndex(base.index);
            const mesh = new THREE.Mesh(geo, material);
            mesh.userData = { base, nx, nz };
            mesh.position.set(0, y, Math.round(busZ0 / L) * L + L - i * L);
            mesh.frustumCulled = false;
            mesh.renderOrder = order;
            shearTile(mesh);
            group.add(mesh);
            tiles.push(mesh);
        }
    };
    let shearTimer = 0;

    // Sea: dense columns near the shore, sparse far out
    const seaXs = [];
    const SEA_NX = 40;
    for (let i = 0; i <= SEA_NX; i++) seaXs.push(14 + (CFG.SEA_FAR - 14) * Math.pow(i / SEA_NX, 1.7));
    const seaBase = buildTile({ xs: seaXs, side: -1, nz: 25, hFn: () => 0, cFn: (c) => c.set(0xFFFFFF), uvx: 0.1, uvz: 0.1 });
    addTiles(seaBase, createSeaMaterial(), SEA_NX, 25, CFG.SEA_Y);

    // Beach (sand, shelving under the water)
    const beachXs = [];
    const BEACH_NX = 28;
    for (let i = 0; i <= BEACH_NX; i++) beachXs.push(7.8 + 30 * (i / BEACH_NX));
    const beachMat = new THREE.MeshLambertMaterial({
        vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2
    });
    const beachBase = buildTile({ xs: beachXs, side: -1, nz: 25, hFn: beachH, cFn: beachColor, uvx: 0.1, uvz: 0.1 });
    addTiles(beachBase, beachMat, BEACH_NX, 25, 0);

    // Foam line lapping the shore
    const foamTex = createFoamTexture();
    const foamMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, transparent: true, alphaMap: foamTex, opacity: 0.8, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6
    });
    const foamBase = buildRibbon([-0.5, 0.3, 1.2, 2.3], 25);
    addTiles(foamBase, foamMat, 3, 25, 0.05, 3);

    // Green hills on the land side
    const greenXs = [];
    const GREEN_NX = 28;
    for (let i = 0; i <= GREEN_NX; i++) greenXs.push(7.8 + (CFG.GREEN_FAR - 7.8) * Math.pow(i / GREEN_NX, 1.5));
    const greenMat = new THREE.MeshLambertMaterial({
        vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2
    });
    const greenBase = buildTile({ xs: greenXs, side: 1, nz: 25, hFn: greenH, cFn: greenColor, uvx: 0.1, uvz: 0.1 });
    addTiles(greenBase, greenMat, GREEN_NX, 25, 0);

    // ---------------------------------------- instanced, recycled props
    const vcMat = (side) => new THREE.MeshLambertMaterial({ vertexColors: true, side: side || THREE.FrontSide });
    const palmMat = makeSway(vcMat(THREE.DoubleSide), 0.022);
    const leafMat = makeSway(vcMat(), 0.014);
    const bushMat = makeSway(vcMat(), 0.02);
    const plainMat = vcMat();

    const propPools = [];
    const put = (it, lat, z, s, yOff = 0) => {
        it.position.x = roadX(z, lat);
        it.position.z = z;
        it.position.y = groundH(lat, z) + yOff;
        it.sx = it.sy = it.sz = s;
        it.rot = rand(0, TAU);
        return it;
    };
    const addProps = (geo, material, count, spacing, placeFn) => {
        const { mesh, flush } = makeInstanced(geo, material, count);
        group.add(mesh);
        const pool = createPool({ count, spacing, place: placeFn, flush });
        propPools.push(pool);
        return { mesh, pool };
    };
    const TINTS = [0xFFFFFF, 0xF3F0DC, 0xE6F0D0, 0xFFF0F0];
    const seaLat = (min, backoff) => -rand(min, shoreD(0) - backoff);

    // Coconut palms: some on the beach (leaning to the sea), more on the land side
    addProps(palmGeo(), palmMat, 32, 12, (it, z) => {
        const sea = Math.random() < 0.42;
        const lat = sea ? -rand(9.5, shoreD(z) - 4.5) : rand(9.5, 40);
        put(it, lat, z, rand(0.85, 1.3), -0.05);
        it.rot = sea ? outward(lat, roadHeading(z)) + rand(-0.7, 0.7) : rand(0, TAU);
        it.color = pick(TINTS);
    });
    addProps(broadleafGeo(), leafMat, 18, 24, (it, z) => {
        put(it, rand(12, 50), z, rand(0.8, 1.35), -0.05);
        it.color = pick(TINTS);
    });
    addProps(bushGeo(0x9BE08C, 0xFFD166), bushMat, 34, 9, (it, z) => {
        const sea = Math.random() < 0.25;
        const lat = sea ? -rand(8.8, 15) : rand(8.8, 42);
        put(it, lat, z, rand(0.8, 1.7), -0.08);
        it.color = pick([0xFFFFFF, 0xEEFFE0, 0xFFF4DA]);
    });
    addProps(bushGeo(0x8EDDA8, 0xFF7FB0), bushMat, 18, 20, (it, z) => {
        put(it, rand(9, 30), z, rand(0.9, 1.6), -0.08);
        it.color = pick([0xFFFFFF, 0xFFEFF6]);
    });

    // Beach huts in four colourways, facing the sea
    [[0xFF8F8F, 0xFFF1D6], [0x4FD1C5, 0xFFE9C8], [0xFFD166, 0xFFE0E0], [0xB69CF5, 0xE6F7FF]].forEach(([roof, wall]) => {
        addProps(hutGeo(roof, wall), plainMat, 4, 95, (it, z) => {
            const lat = -rand(11, 16.5);
            put(it, lat, z, rand(0.95, 1.2), -0.05);
            it.rot = roadHeading(z) - Math.PI / 2 + rand(-0.2, 0.2);
            it.color = 0xFFFFFF;
        });
    });
    // Beach umbrellas (tinted instances)
    addProps(umbrellaGeo(), plainMat, 14, 24, (it, z) => {
        const lat = -rand(11.5, shoreD(z) - 5);
        put(it, lat, z, rand(0.9, 1.2), -0.02);
        it.color = pick([0xFF8FA3, 0xFFD166, 0x6EE7E0, 0xB69CF5, 0xFFA45C]);
    });

    // Rocks in the shallows, each with two splash puffs that rise and vanish
    const rocks = addProps(rockGeo(), plainMat, 14, 22, (it, z) => {
        const lat = -(shoreD(z) + rand(3, 15));
        put(it, lat, z, rand(0.9, 1.8), 0);
        it.position.y = CFG.SEA_Y - 0.15;
        it.color = pick([0xFFFFFF, 0xF4EAE4, 0xEFE6E0]);
    });
    const splashGeo = colorize(new THREE.SphereGeometry(0.5, 8, 6), 0xFFFFFF);
    const splashMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF, emissive: 0x9FB8C8, vertexColors: true });
    const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, rocks.pool.items.length * 2);
    splashMesh.frustumCulled = false;
    group.add(splashMesh);

    // Fishing boats (bobbing), plus a few pulled up on the sand
    const boatMat = vcMat();
    const boatGeos = [[0x3FA7C9, 0xFFD166], [0xFF7A7A, 0xFFF1D6], [0xF5C84C, 0x4FB6C9], [0xFFFFFF, 0xFF8FA3]]
        .map(([h, c]) => boatGeo(h, c));
    const boats = [];
    for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(boatGeos[i % boatGeos.length], boatMat);
        m.userData = { beached: i >= 7, phase: rand(0, TAU) };
        m.frustumCulled = false;
        group.add(m);
        boats.push(m);
    }
    const boatPool = createPool({
        items: boats, spacing: 38,
        place: (m, z) => {
            const h = roadHeading(z);
            if (m.userData.beached) {
                const lat = -(shoreD(z) - rand(1.5, 3.0));
                m.position.set(roadX(z, lat), beachH(lat, z) + 0.15, z);
                m.rotation.set(0.1, h + Math.PI / 2 + rand(-1.0, 1.0), 0.12);
            } else {
                const lat = -(shoreD(z) + rand(10, 48));
                m.position.set(roadX(z, lat), CFG.SEA_Y + 0.05, z);
                m.rotation.set(0, h + Math.PI / 2 + rand(-0.5, 0.5), 0);
                m.userData.lat = lat;
            }
            m.scale.setScalar(rand(0.9, 1.25));
        }
    });

    // Lighthouse with a rotating beam
    const towerMat = vcMat();
    const towerGeo = lighthouseGeo();
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xFFF2B0 });
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xFFF0B0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const beamGeo = new THREE.ConeGeometry(1.8, 24, 12, 1, true);
    beamGeo.translate(0, -12, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const lampGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const lighthouses = [];
    for (let i = 0; i < 2; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(towerGeo, towerMat));
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.y = 13.5;
        g.add(lamp);
        const beams = new THREE.Group();
        beams.position.y = 13.5;
        const b1 = new THREE.Mesh(beamGeo, beamMat);
        const b2 = new THREE.Mesh(beamGeo, beamMat);
        b2.rotation.y = Math.PI;
        beams.add(b1, b2);
        g.add(beams);
        g.userData = { beams };
        g.frustumCulled = false;
        group.add(g);
        lighthouses.push(g);
    }
    const lighthousePool = createPool({
        items: lighthouses, spacing: 430, ahead: -50,
        place: (g, z) => {
            const lat = -rand(14, 17);
            g.position.set(roadX(z, lat), beachH(lat, z) - 0.15, z);
            g.rotation.y = rand(0, TAU);
            g.scale.setScalar(1.15);
        }
    });

    // Jetty running out into the sea
    const jettyMat = vcMat();
    const jettyGeometry = jettyGeo();
    const jetties = [];
    for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(jettyGeometry, jettyMat);
        m.frustumCulled = false;
        group.add(m);
        jetties.push(m);
    }
    const jettyPool = createPool({
        items: jetties, spacing: 300, ahead: -140,
        place: (m, z) => {
            const lat = -(shoreD(z) - 8);
            m.position.set(roadX(z, lat), 0, z);
            m.rotation.y = outward(lat, roadHeading(z));
        }
    });

    // Seagulls circling in loose flocks
    const gullGeos = gullParts();
    const gullMat = vcMat(THREE.DoubleSide);
    const flocks = [];
    for (let f = 0; f < 4; f++) {
        const fg = new THREE.Group();
        const gulls = [];
        for (let i = 0; i < 3; i++) {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(gullGeos.body, gullMat));
            const lw = new THREE.Group();
            lw.add(new THREE.Mesh(gullGeos.left, gullMat));
            const rw = new THREE.Group();
            rw.add(new THREE.Mesh(gullGeos.right, gullMat));
            g.add(lw, rw);
            fg.add(g);
            gulls.push({
                g, lw, rw, R: rand(4, 11), h: rand(6, 14), ang: rand(0, TAU),
                speed: rand(0.35, 0.6), dir: Math.random() < 0.5 ? -1 : 1, flap: rand(5, 8), phase: rand(0, TAU)
            });
        }
        fg.userData = { gulls };
        group.add(fg);
        flocks.push(fg);
    }
    const flockPool = createPool({
        items: flocks, spacing: 75, ahead: 0,
        place: (fg, z) => {
            const lat = -(shoreD(z) + rand(0, 35));
            fg.position.set(roadX(z, lat), 0, z);
        }
    });

    // ------------------------------------------------------------ control
    function setWeight(w) {
        weight = clamp01(w);
        group.visible = weight > 0.01;
        const e = weight * weight * (3 - 2 * weight);
        group.position.y = -(1 - e) * CFG.SINK;
        beamMat.opacity = 0.2 * e;
    }

    function update(dt, busObj, w) {
        if (w !== undefined) setWeight(w);
        if (!group.visible) return;
        const b = busObj || bus;
        if (!b || !b.position) return;
        const bz = b.position.z;
        time += dt;
        seaTime.value = time;

        // Tiles hop from behind to the far end and re-fit to the road bend
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
        boatPool.update(bz);
        lighthousePool.update(bz);
        jettyPool.update(bz);
        flockPool.update(bz);

        // Foam lapping in and out
        foamTex.offset.x = time * 0.05;
        foamTex.offset.y = time * 0.02;
        foamMat.opacity = 0.62 + 0.25 * Math.sin(time * 1.3);

        // Boats bob and roll with the swell
        for (const m of boats) {
            if (m.userData.beached) continue;
            const ph = time * 1.3 + m.userData.phase;
            const k = 0.05 + 0.18 * smooth(26, 90, Math.abs(m.userData.lat || 0));
            m.position.y = CFG.SEA_Y + 0.08 + Math.sin(ph) * k;
            m.rotation.z = Math.sin(ph * 0.9 + 1.0) * 0.06;
            m.rotation.x = Math.sin(ph * 0.7) * 0.03;
        }

        for (const g of lighthouses) g.userData.beams.rotation.y += dt * 1.1;

        // Splash puffs burst up from each rock and shrink away
        const rItems = rocks.pool.items;
        for (let i = 0; i < rItems.length; i++) {
            const r = rItems[i];
            for (let k = 0; k < 2; k++) {
                const ph = (time * 0.7 + i * 0.31 + k * 0.5) % 1;
                const s = Math.sin(Math.PI * ph) * 0.55 * r.sx;
                _dummy.position.set(r.position.x + (k ? 0.5 : -0.4) * r.sx, r.position.y + r.sx * (0.5 + ph * 1.2), r.position.z + (k ? -0.3 : 0.3) * r.sx);
                _dummy.rotation.set(0, 0, 0);
                _dummy.scale.set(Math.max(0.0001, s), Math.max(0.0001, s * 0.8), Math.max(0.0001, s));
                _dummy.updateMatrix();
                splashMesh.setMatrixAt(i * 2 + k, _dummy.matrix);
            }
        }
        splashMesh.instanceMatrix.needsUpdate = true;

        // Gulls wheel overhead, flapping
        for (const fg of flocks) {
            for (const s of fg.userData.gulls) {
                s.ang += dt * s.speed * s.dir;
                const ca = Math.cos(s.ang);
                const sa = Math.sin(s.ang);
                s.g.position.set(ca * s.R, s.h + Math.sin(s.ang * 2 + s.phase) * 0.6, sa * s.R);
                s.g.rotation.y = Math.atan2(-ca * s.dir, -sa * s.dir);
                const f = Math.sin(time * s.flap + s.phase) * 0.55;
                s.lw.rotation.x = -f;
                s.rw.rotation.x = f;
            }
        }
    }

    setWeight(0);
    return { group, update, setWeight };
}
