// =============================================
// ROUNDED BOXES - soft edges for vehicles and buildings
// A drop-in for THREE.BoxGeometry built on three.js's RoundedBoxGeometry add-on,
// which also lays the texture coordinates over the curved edges, so liveries
// and signs keep their proportions.
// =============================================

import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Curve segments per rounded edge: enough to read as smooth at game distances
const EDGE_SEGMENTS = 2;

/**
 * A box with rounded edges and corners.
 *
 * `parameters` keeps the real width/height/depth: RoundedBoxGeometry is built
 * from a unit box and would otherwise report 1 for each, and code such as the
 * car roof placement reads these values.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} depth
 * @param {number} [radius] - Edge radius; by default a quarter of the shortest
 *        side, never more than 0.25 so large buildings keep crisp silhouettes
 * @returns {THREE.BufferGeometry}
 */
export function roundedBox(width, height, depth, radius = Math.min(0.25, Math.min(width, height, depth) * 0.25)) {
    const geometry = new RoundedBoxGeometry(width, height, depth, EDGE_SEGMENTS, radius);
    geometry.parameters = { width, height, depth, radius };
    return geometry;
}

// =============================================
// TOY PALETTE + CHEAP ANIMATION REGISTRY
// =============================================

/**
 * Blends a colour towards white, for the soft candy-pastel toy look.
 * @param {number} hex - 0xRRGGBB
 * @param {number} [amount] - 0 keeps the colour, 1 is white
 * @returns {number}
 */
export function pastel(hex, amount = 0.35) {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    const mix = (c) => Math.round(c + (255 - c) * amount);
    return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Linear interpolation (avoids depending on THREE.MathUtils.lerp). */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Sets a material colour from a hex, tolerating colour-less stub materials. */
export function setHex(material, hex) {
    const c = material.color;
    if (c && typeof c.setHex === 'function') c.setHex(hex);
    else material.color = hex;
}

/** Sets a material colour from 0..1 RGB, tolerating stub materials. */
export function setRGB(material, r, g, b) {
    const c = material.color;
    if (c && typeof c.setRGB === 'function') c.setRGB(r, g, b);
    else {
        const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        material.color = (q(r) << 16) | (q(g) << 8) | q(b);
    }
}

/** Clones a material, tolerating stub materials without clone(). */
export function cloneMaterial(material) {
    if (typeof material.clone === 'function') return material.clone();
    return Object.assign(Object.create(Object.getPrototypeOf(material)), material);
}

// Props register a per-frame callback here; physics.js ticks the registry once
// per frame (updateBusPhysics already runs every frame), so main.js needs no
// extra wiring. Entries whose root was removed from the scene are dropped.
const animations = new Set();
let animTime = 0;

/**
 * Registers a small idle animation (flag flutter, spinning sign, blinking lamp).
 * @param {THREE.Object3D} root - Top-level object owning the animation
 * @param {(t: number, dt: number) => void} fn
 */
export function registerAnimation(root, fn) {
    animations.add({ root, fn, seen: false });
}

/**
 * Advances every registered prop animation. Called once per frame.
 * @param {number} dt - seconds
 */
export function tickAnimations(dt) {
    animTime += dt;
    for (const entry of animations) {
        let top = entry.root;
        while (top.parent) top = top.parent;
        const attached = top.isScene === true;
        if (attached) entry.seen = true;
        else if (entry.seen) { animations.delete(entry); continue; }
        if (attached && entry.root.visible) entry.fn(animTime, dt);
    }
}
