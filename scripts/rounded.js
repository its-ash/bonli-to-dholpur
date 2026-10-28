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
