// =============================================
// BIOMES - the zones the route passes through
// Farmland -> Aravalli hills -> Thar desert -> sea coast -> farmland (see BIOMES
// in constants.js). The manager picks the zone from the journey distance and
// crossfades (over BIOME_CROSSFADE units) the ground, road shoulders, fog, sky
// tint and light colours between neighbouring zones. Scenery modules register
// with registerBiome(id, module):
//     module = { group, update(dt, bus, weight), setWeight(w) }
// weight 0 = hidden (group.visible = false), 1 = fully present.
// =============================================

import * as THREE from 'three';
import {
    BIOMES, BIOME_CROSSFADE, PLAYER_START_Z, ROAD_HALF_WIDTH, SHOULDER_WIDTH
} from './constants.js';
import { roadPoint } from './roadpath.js';
import { GROUND_TILES } from './environment.js';
import { createMountainBiome } from './biome_mountain.js';
import { createDesertBiome } from './biome_desert.js';
import { createCoastBiome } from './biome_coast.js';

export const BIOME_IDS = ['farmland', 'mountain', 'desert', 'coast'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Linear blend of two 0xRRGGBB colours. */
export function mixHex(a, b, t) {
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return (r << 16) | (g << 8) | bl;
}

/** Blends two whole palettes. */
const mixPalette = (from, to, t) => ({
    ground: mixHex(from.ground, to.ground, t),
    shoulder: mixHex(from.shoulder, to.shoulder, t),
    fog: mixHex(from.fog, to.fog, t),
    fogNear: lerp(from.fogNear, to.fogNear, t),
    fogFar: lerp(from.fogFar, to.fogFar, t),
    sky: mixHex(from.sky, to.sky, t),
    sun: mixHex(from.sun, to.sun, t),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity, t),
    hemiSky: mixHex(from.hemiSky, to.hemiSky, t),
    hemiGround: mixHex(from.hemiGround, to.hemiGround, t)
});

/** Index of the zone that contains a distance (clamped to the route). */
export function zoneIndexAt(distance) {
    for (let i = 0; i < BIOMES.length; i++) {
        if (distance < BIOMES[i].end) return i;
    }
    return BIOMES.length - 1;
}

/**
 * Everything the manager needs to know at a route distance.
 * The crossfade is centred on each zone boundary and BIOME_CROSSFADE wide.
 * @param {number} distance - route distance in world units
 * @returns {{index:number, zone:Object, next:Object|null, blend:number,
 *            weights:Object, palette:Object}}
 */
export function computeBiomeState(distance) {
    const half = BIOME_CROSSFADE / 2;
    const d = Math.max(0, distance);
    const i = zoneIndexAt(d);
    const zone = BIOMES[i];

    // Which neighbouring boundary (if any) is currently blending?
    let other = null;      // the zone being blended with
    let s = 0;             // share of `other` (0..1, eased)
    const toEnd = zone.end - d;
    const fromStart = d - zone.start;
    if (i < BIOMES.length - 1 && toEnd < half) {
        other = BIOMES[i + 1];
        s = smooth(clamp01((half - toEnd) / BIOME_CROSSFADE));      // 0 -> 0.5 at the boundary
    } else if (i > 0 && fromStart < half) {
        other = BIOMES[i - 1];
        s = smooth(clamp01((half - fromStart) / BIOME_CROSSFADE));  // 0.5 at the boundary -> 0
    }

    const weights = { farmland: 0, mountain: 0, desert: 0, coast: 0 };
    weights[zone.id] += 1 - s;
    if (other) weights[other.id] += s;

    const palette = other ? mixPalette(zone.palette, other.palette, s) : { ...zone.palette };

    // The containing zone always holds at least half the weight. `next` is the
    // following zone; `blend` is how far the crossfade towards it has gone
    // (0 outside the window, up to 0.5 at the boundary itself).
    const next = i < BIOMES.length - 1 ? BIOMES[i + 1] : null;
    const blend = other === next && next ? s : 0;
    return { index: i, zone, next, blend, weights, palette, previous: other && other !== next ? other : null };
}

/** Zone weights at a route distance (what landscape.js samples per item). */
export const weightsAtDistance = (distance) => computeBiomeState(distance).weights;

/** A near-white tileable ground texture; the biome colour does the tinting. */
function createNeutralGroundTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 10 + Math.random() * 22;
        const shade = i % 2 ? '0,0,0' : '255,255,255';
        const alpha = i % 2 ? 0.07 : 0.16;
        [-size, 0, size].forEach(ox => [-size, 0, size].forEach(oy => {
            const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
            g.addColorStop(0, `rgba(${shade},${alpha})`);
            g.addColorStop(1, `rgba(${shade},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(GROUND_TILES, GROUND_TILES);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const setColor = (target, hex) => {
    if (!target) return;
    if (typeof target.setHex === 'function') target.setHex(hex);
};

/**
 * @param {Object} options
 * @param {THREE.Scene} options.scene
 * @param {THREE.Object3D} options.bus
 * @param {Object} options.journey - exposes `distance`
 * @param {Object} [options.landscape] - setBiomeWeights / setBiomeSampler
 * @param {THREE.WebGLRenderer} [options.renderer]
 * @param {THREE.Mesh} [options.ground] - the ground plane to tint
 * @param {THREE.Mesh} [options.skyDome] - the sky dome to tint
 * @param {THREE.Light} [options.sun]
 * @param {THREE.HemisphereLight} [options.hemiLight]
 * @param {(zone: Object) => void} [options.onZoneChange] - fired when the bus enters a new zone
 */
export function createBiomeManager({
    scene, bus, journey, landscape, renderer, ground, skyDome, sun, hemiLight, onZoneChange
}) {
    const registry = new Map();     // id -> { module, weight }
    let state = computeBiomeState(0);
    let lastIndex = state.index;

    // Solid shoulder strips laid over the baked road shoulders so they can be tinted
    const shoulderMaterial = new THREE.MeshLambertMaterial({
        color: BIOMES[0].palette.shoulder,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    // The road bends, so the strips are short pieces snapped to a z grid that
    // follow roadpath.js (position and heading) and are recycled with the bus.
    const SHOULDER_PIECE = 30;
    const SHOULDER_AHEAD = 14;     // pieces ahead of the bus
    const SHOULDER_BEHIND = 4;
    const shoulderGeometry = new THREE.PlaneGeometry(SHOULDER_WIDTH, SHOULDER_PIECE + 1);
    const shoulders = [];
    for (let i = 0; i < SHOULDER_AHEAD + SHOULDER_BEHIND; i++) {
        [-1, 1].forEach(side => {
            const strip = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
            strip.rotation.order = 'YXZ';
            strip.rotation.x = -Math.PI / 2;
            strip.receiveShadow = true;
            strip.frustumCulled = false;
            strip.userData.side = side;
            strip.userData.slot = i;
            if (scene && scene.add) scene.add(strip);
            shoulders.push(strip);
        });
    }

    function layoutShoulders(busZ) {
        const base = Math.round(busZ / SHOULDER_PIECE) * SHOULDER_PIECE;
        shoulders.forEach(strip => {
            const z = base + (SHOULDER_BEHIND - strip.userData.slot) * SHOULDER_PIECE;
            const p = roadPoint(z, strip.userData.side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH / 2));
            strip.position.set(p.x, 0.02, p.z);
            strip.rotation.y = p.heading;
        });
    }

    // Neutral ground texture so the biome colour is not multiplied into green grass
    if (ground && ground.material) {
        try {
            ground.material.map = createNeutralGroundTexture();
            ground.material.needsUpdate = true;
        } catch (e) {
            // Keep the original grass texture if a canvas is unavailable
        }
    }

    if (landscape && typeof landscape.setBiomeSampler === 'function') {
        landscape.setBiomeSampler(weightsAtDistance);
    }

    function registerBiome(id, module) {
        if (!module || !module.group) return;
        const existing = registry.get(id);
        if (existing && existing.module.group !== module.group && existing.module.group.parent) {
            existing.module.group.parent.remove(existing.module.group);
        }
        registry.set(id, { module, weight: -1 });
        module.group.visible = false;
        if (!module.group.parent && scene && scene.add) scene.add(module.group);
    }

    // The scenery packages plug in here (each returns { group, update, setWeight })
    registerBiome('mountain', createMountainBiome({ scene, bus }));
    registerBiome('desert', createDesertBiome({ scene, bus }));
    registerBiome('coast', createCoastBiome({ scene, bus }));

    function applyPalette(p) {
        if (scene && scene.fog) {
            if (scene.fog.color && typeof scene.fog.color.setHex === 'function') scene.fog.color.setHex(p.fog);
            else scene.fog.color = p.fog;
            scene.fog.near = p.fogNear;
            scene.fog.far = p.fogFar;
        }
        if (ground && ground.material) setColor(ground.material.color, p.ground);
        setColor(shoulderMaterial.color, p.shoulder);
        if (skyDome && skyDome.material) setColor(skyDome.material.color, p.sky);
        if (sun) {
            setColor(sun.color, p.sun);
            sun.intensity = p.sunIntensity;
        }
        if (hemiLight) {
            setColor(hemiLight.color, p.hemiSky);
            setColor(hemiLight.groundColor, p.hemiGround);
        }
        if (renderer && renderer.setClearColor) renderer.setClearColor(p.fog);
    }

    function currentDistance() {
        if (journey && typeof journey.distance === 'number') return journey.distance;
        return PLAYER_START_Z - bus.position.z;
    }

    /** Advances the zone from the journey distance and updates every biome. */
    function update(dt = 0) {
        state = computeBiomeState(currentDistance());
        applyPalette(state.palette);

        layoutShoulders(bus.position.z);
        if (landscape && typeof landscape.setBiomeWeights === 'function') {
            landscape.setBiomeWeights(state.weights);
        }

        registry.forEach((entry, id) => {
            const w = state.weights[id] || 0;
            const { module } = entry;
            if (Math.abs(w - entry.weight) > 1e-4 || (w === 0) !== (entry.weight === 0)) {
                entry.weight = w;
                module.setWeight(w);
            }
            module.group.visible = w > 0.001;
            if (w > 0.001) module.update(dt, bus, w);
        });

        if (state.index !== lastIndex) {
            lastIndex = state.index;
            if (typeof onZoneChange === 'function') onZoneChange(state.zone);
        }
    }

    /** @returns {{id:string, name:string, nameHi:string, next:string|null, blend:number, weights:Object}} */
    function getState() {
        return {
            id: state.zone.id,
            name: state.zone.en,
            nameHi: state.zone.name,
            index: state.index,
            next: state.next ? state.next.id : null,
            nextName: state.next ? state.next.en : null,
            blend: state.blend,
            weights: { ...state.weights }
        };
    }

    update(0);

    return { registerBiome, update, getState, weightsAtDistance, group: shoulders };
}
