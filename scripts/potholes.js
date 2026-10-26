// =============================================
// POT HOLES
// The road starts out clean and then progressively breaks up: after
// POTHOLE_MIN_DISTANCE the asphalt is peppered with holes that shake the bus
// and bleed off speed when a wheel drops into one.
//
// Holes are recycled by the endless world, so a hole is just a flat mesh that
// carries a world Z; nothing here depends on the road being finite.
// =============================================

import * as THREE from 'three';
import { LANES_FORWARD, LANES_ONCOMING, ROAD_HALF_WIDTH } from './constants.js';

// Every lane a hole may appear in (all four lanes of the highway)
const ALL_LANES = [...LANES_FORWARD, ...LANES_ONCOMING];

// Dark, cracked palette for the asphalt hole
const HOLE_COLORS = ['#111111', '#161616', '#0B0B0B', '#1B1B1B'];

/**
 * Draws one irregular pot hole texture: a dark blob with a lighter cracked rim
 * so the edge reads clearly against the asphalt.
 *
 * @param {number} [size] - Canvas size in texels (kept tiny for pixel art)
 * @returns {THREE.CanvasTexture}
 */
function createPotholeTexture(size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Transparent background: only the hole itself is opaque
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // Ragged outline built from a radius that wobbles around the circle
    const points = [];
    const steps = 14;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const wobble = 0.72 + Math.random() * 0.28;
        points.push({
            x: cx + Math.cos(angle) * cx * wobble,
            y: cy + Math.sin(angle) * cy * wobble
        });
    }

    const tracePath = () => {
        ctx.beginPath();
        points.forEach((point, i) => {
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
    };

    // Lighter rim (broken asphalt edge)
    ctx.fillStyle = '#4A4A4A';
    tracePath();
    ctx.fill();

    // Dark interior, slightly smaller so the rim shows all round
    ctx.fillStyle = HOLE_COLORS[Math.floor(Math.random() * HOLE_COLORS.length)];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.78, 0.78);
    ctx.translate(-cx, -cy);
    tracePath();
    ctx.fill();
    ctx.restore();

    // A couple of blocky cracks running out from the rim
    ctx.fillStyle = '#3A3A3A';
    for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const start = cx + Math.cos(angle) * cx * 0.7;
        const startY = cy + Math.sin(angle) * cy * 0.7;
        ctx.fillRect(Math.round(start), Math.round(startY), 2, 2);
        ctx.fillRect(
            Math.round(start + Math.cos(angle) * 4),
            Math.round(startY + Math.sin(angle) * 4),
            2, 2
        );
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a single pot hole lying flat on the road.
 * The returned group's `userData` carries the radius used for the bump test,
 * so physics never has to guess it from the mesh scale.
 *
 * @param {Object} [options]
 * @param {number} [options.x] - Lateral position on the road
 * @param {number} [options.z] - Position along the road
 * @param {number} [options.radius] - Half-size used for the bump test
 * @returns {THREE.Group}
 */
export function createPothole({ x = ALL_LANES[0], z = 0, radius = 1.1 } = {}) {
    const hole = new THREE.Group();

    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 2, radius * 2),
        new THREE.MeshBasicMaterial({
            map: createPotholeTexture(),
            transparent: true,
            depthWrite: false
        })
    );
    // Lay it flat, just above the asphalt so it never z-fights the road
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = Math.random() * Math.PI * 2;
    plane.receiveShadow = false;
    hole.add(plane);

    hole.position.set(x, 0.03, z);

    hole.userData.isPothole = true;
    hole.userData.radius = radius;
    // World footprint used by updatePotholes() for recycling
    hole.userData.hitRadius = radius * 0.85;

    return hole;
}

/**
 * Picks a lateral position for a hole, keeping it inside one of the four lanes.
 * Holes in the middle of the road are avoided so they always sit where a wheel
 * can actually pass over them.
 *
 * @returns {number}
 */
export function randomPotholeX() {
    const lane = ALL_LANES[Math.floor(Math.random() * ALL_LANES.length)];
    // Stay a little away from the lane markings and the shoulder
    const jitter = (Math.random() - 0.5) * 1.2;
    const limit = ROAD_HALF_WIDTH - 1.4;
    return Math.max(-limit, Math.min(limit, lane + jitter));
}

/**
 * Finds the pot hole under a point, if any.
 *
 * @param {Array<THREE.Object3D>} potholes
 * @param {number} x
 * @param {number} z
 * @param {number} [extra] - Extra tolerance (e.g. half a vehicle width)
 * @returns {THREE.Object3D|null}
 */
export function findPotholeAt(potholes, x, z, extra = 0) {
    if (!potholes) return null;

    for (const hole of potholes) {
        if (!hole || !hole.userData) continue;
        const reach = (hole.userData.hitRadius || hole.userData.radius || 1) + extra;
        if (Math.abs(hole.position.x - x) <= reach && Math.abs(hole.position.z - z) <= reach) {
            return hole;
        }
    }

    return null;
}

/**
 * Applies the bump of a pot hole to a vehicle.
 * The vehicle loses a share of its speed and is jolted sideways, and the
 * caller can read `userData.bumpTimer` to shake the camera/HUD.
 *
 * @param {THREE.Object3D} vehicle - Player bus
 * @param {Object} hole - Pot hole group
 * @param {Object} tuning - { drag, minSpeed }
 * @returns {boolean} true when the bump was applied
 */
export function applyPotholeBump(vehicle, hole, { drag = 0.55, minSpeed = 4 } = {}) {
    if (!vehicle || !vehicle.userData || !hole) return false;

    const data = vehicle.userData;
    const speed = Math.abs(data.speed || 0);

    // Crawling over a hole barely matters
    if (speed >= minSpeed) {
        const lost = speed * drag;
        data.speed = Math.sign(data.speed || 1) * Math.max(0, speed - lost);
    }

    // A short jolt: the bus is knocked a little to one side
    const nudge = Math.random() < 0.5 ? -1 : 1;
    vehicle.position.x += nudge * 0.12;

    // Remember the bump so the HUD/camera can shake and the same hole does not
    // trigger twice in a row
    data.bumpTimer = 0.35;
    data.lastPothole = hole;
    return true;
}
