// =============================================
// ROAD PATH - the single source of truth for where the road goes
// The road runs towards -Z but bends left and right. Everything that sits
// on or beside the road (segments, traffic, stops, scenery, autopilot, the
// edge walls) must use these helpers instead of assuming the road is at x=0:
//
//   worldX = roadCenterX(z) + lateralOffset
//
// Bends are a sum of gentle sine waves, faded to dead straight around
// junctions (roundabouts / crossroads) so those can be built square-on.
// =============================================

// Bends: amplitude (units of x) and wavelength (units of z)
export const ROAD_BENDS = [
    { amp: 50, len: 1100, phase: 0.0 },
    { amp: 20, len: 640,  phase: 1.3 },
    { amp: 5,  len: 300,  phase: 2.1 }
];

// Straight run around the bus spawn so the start bus stand is square
export const STRAIGHT_ZONES = [];
const STRAIGHT_FADE = 700; // metres over which a bend eases into a straight

/**
 * Registers a stretch of road that must be straight (e.g. a junction).
 * @param {number} z - centre of the straight stretch
 * @param {number} halfLength - half the straight length
 */
export function addStraightZone(z, halfLength) {
    STRAIGHT_ZONES.push({ z, halfLength });
}

function rawX(z) {
    let x = 0;
    for (const b of ROAD_BENDS) x += b.amp * Math.sin((z / b.len) * Math.PI * 2 + b.phase);
    return x;
}

function smoothstep(t) {
    t = Math.min(1, Math.max(0, t));
    return t * t * (3 - 2 * t);
}

// 0 inside a straight zone, 1 far from every zone
function bendWeight(z) {
    let w = 1;
    // A product (not a min) so the blend has no kinks where two zones' fades meet
    for (const s of mergedZones()) {
        const d = Math.abs(z - s.z) - s.halfLength;
        w *= smoothstep(d / STRAIGHT_FADE);
    }
    return w;
}

/**
 * x of the road's centre line at depth z. Inside a straight zone the road
 * holds the x it has at the zone's centre.
 * @param {number} z
 * @returns {number}
 */
export function roadCenterX(z) {
    const w = bendWeight(z);
    if (w >= 1) return rawX(z);
    const anchor = anchorX(z);
    return anchor + (rawX(z) - anchor) * w;
}

// The x the road holds near straight zones: constant inside a zone and
// eased (smoothstep) from one zone's x to the next across the gap between
// them, so neighbouring zones never make the road jump sideways.
// Overlapping zones are merged into one straight stretch (one anchor).
let mergedCache = null;
let mergedFor = -1;
function mergedZones() {
    if (mergedCache && mergedFor === STRAIGHT_ZONES.length) return mergedCache;
    const spans = STRAIGHT_ZONES.map(s => [s.z - s.halfLength, s.z + s.halfLength]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [lo, hi] of spans) {
        const last = out[out.length - 1];
        if (last && lo <= last.hi) last.hi = Math.max(last.hi, hi);
        else out.push({ lo, hi });
    }
    mergedCache = out.map(m => ({ z: (m.lo + m.hi) / 2, halfLength: (m.hi - m.lo) / 2 }));
    mergedFor = STRAIGHT_ZONES.length;
    return mergedCache;
}

function anchorX(z) {
    let below = null; // nearest zone edge at lower z (further along the route)
    let above = null; // nearest zone edge at higher z
    for (const s of mergedZones()) {
        const lo = s.z - s.halfLength;
        const hi = s.z + s.halfLength;
        if (z >= lo && z <= hi) return rawX(s.z);
        if (hi < z && (!above || hi > above.edge)) above = { edge: hi, x: rawX(s.z) };
        if (lo > z && (!below || lo < below.edge)) below = { edge: lo, x: rawX(s.z) };
    }
    if (!above) return below ? below.x : rawX(z);
    if (!below) return above.x;
    const t = smoothstep((z - above.edge) / (below.edge - above.edge));
    return above.x + (below.x - above.x) * t;
}

/**
 * Heading of the road at z as a yaw angle (radians, Three.js rotation.y)
 * for something driving towards -Z. 0 = straight down -Z.
 * @param {number} z
 * @returns {number}
 */
export function roadHeading(z) {
    const h = 0.5;
    const dxdz = (roadCenterX(z + h) - roadCenterX(z - h)) / (2 * h);
    // Moving towards -Z: forward = (dx, -1) per unit; yaw so that
    // forward (0,0,-1) rotated by yaw gives (-sin(yaw), -cos(yaw))
    return Math.atan2(dxdz, 1);
}

/**
 * Point at a lateral offset from the centre line, measured perpendicular to
 * the road (positive = right side when driving towards -Z).
 * @param {number} z
 * @param {number} offset
 * @returns {{x: number, z: number, heading: number}}
 */
export function roadPoint(z, offset = 0) {
    const heading = roadHeading(z);
    return {
        x: roadCenterX(z) + offset * Math.cos(heading),
        z: z - offset * Math.sin(heading),
        heading
    };
}

/**
 * Signed lateral distance of a world point from the centre line
 * (approximation valid for these gentle bends).
 */
export function lateralOffset(x, z) {
    return (x - roadCenterX(z)) * Math.cos(roadHeading(z));
}
