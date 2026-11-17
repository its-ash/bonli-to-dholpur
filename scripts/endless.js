// =============================================
// ENDLESS WORLD
// The road never ends: it is built from a fixed pool of segments and scenery
// that follows the bus. Anything that falls behind the player is picked up and
// placed again at the far horizon, so the drive can go on forever without
// allocating new objects.
//
// This module owns the 4-lane road surface, the trees, the dhabas, the petrol
// pumps and the distance boards. The bus stand belongs to the start of the
// journey and is added once by main.js.
// =============================================

import * as THREE from 'three';
import {
    SEGMENT_LENGTH, SEGMENT_COUNT, SEGMENT_RECYCLE_BEHIND,
    ROAD_WIDTH, SHOULDER_WIDTH, ROAD_HALF_WIDTH, ROAD_LENGTH, PLAYER_START_Z,
    DHABA_X, DHABA_GAP_MIN, DHABA_GAP_MAX,
    DISTANCE_BOARDS, DISTANCE_BOARD_X
} from './constants.js';
import { createRoadSegmentTexture } from './utils.js';
import { createRoadsideTree } from './environment.js';
import { createDhaba } from './shops.js';
import { createPetrolPump } from './petrolpump.js';
import { createDistanceBoard } from './signs.js';
import { roadPoint, roadHeading } from './roadpath.js';

// Road ribbon sampling: one cross-section every ROAD_STEP metres along z
const ROAD_STEP = 2;
const ROAD_TILE = 60;      // metres of road covered by one texture repeat
const ROAD_LIFT = 0.03;

// Arc length of the centre line, memoised on the ROAD_STEP grid so that the
// texture coordinate is continuous from one recycled segment to the next.
// Grid index k sits at z = ARC_Z0 - k * ROAD_STEP.
const ARC_Z0 = PLAYER_START_Z + SEGMENT_LENGTH * 4;
const arcCache = new Map([[0, 0]]);
function arcAt(k) {
    if (arcCache.has(k)) return arcCache.get(k);
    const dir = k > 0 ? -1 : 1;         // walk back towards 0
    let j = k;
    while (!arcCache.has(j)) j += dir;
    while (j !== k) {
        const next = j - dir;
        const a = roadPoint(ARC_Z0 - j * ROAD_STEP, 0);
        const b = roadPoint(ARC_Z0 - next * ROAD_STEP, 0);
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        arcCache.set(next, arcCache.get(j) + (next > j ? d : -d));
        j = next;
    }
    return arcCache.get(k);
}

/**
 * Fills a road-ribbon geometry for the stretch of road whose near end is at
 * `nearZ`. Vertices are in the mesh's local space (origin at the segment's
 * centre z), following the bend of the road.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} nearZ - z of the end nearest the start of the road
 * @param {number} halfWidth - half the ribbon width (carriageway + shoulders)
 */
function fillRoadRibbon(geometry, nearZ, halfWidth) {
    const rows = Math.round(SEGMENT_LENGTH / ROAD_STEP) + 1;
    const centreZ = nearZ - SEGMENT_LENGTH / 2;
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const k0 = Math.round((ARC_Z0 - nearZ) / ROAD_STEP);

    for (let i = 0; i < rows; i++) {
        const z = nearZ - i * ROAD_STEP;
        const v = arcAt(k0 + i) / ROAD_TILE;
        const l = roadPoint(z, -halfWidth);
        const r = roadPoint(z, halfWidth);
        pos.setXYZ(i * 2, l.x, 0, l.z - centreZ);
        pos.setXYZ(i * 2 + 1, r.x, 0, r.z - centreZ);
        uv.setXY(i * 2, 0, v);
        uv.setXY(i * 2 + 1, 1, v);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    if (geometry.computeBoundingSphere) geometry.computeBoundingSphere();
}

/** Builds an empty ribbon geometry (positions are filled by fillRoadRibbon). */
function createRoadRibbon() {
    const rows = Math.round(SEGMENT_LENGTH / ROAD_STEP) + 1;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * 2 * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(
        new Float32Array(Array.from({ length: rows * 2 }, () => [0, 1, 0]).flat()), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rows * 2 * 2), 2));
    const index = [];
    for (let i = 0; i < rows - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        index.push(a, b, c, b, d, c);
    }
    geometry.setIndex(index);
    return geometry;
}

/**
 * Places something beside the road: `lateral` metres from the centre line
 * (+ = right), turned to follow the road's heading.
 * @param {THREE.Object3D} obj - needs userData.baseYaw (its own rotation)
 * @param {number} z
 * @param {number} lateral
 */
export function placeBesideRoad(obj, z, lateral) {
    const p = roadPoint(z, lateral);
    obj.position.x = p.x;
    obj.position.z = p.z;
    obj.rotation.y = (obj.userData.baseYaw || 0) + p.heading;
}

// How far behind the bus a piece of scenery may drift before it is recycled
const SCENERY_BEHIND = 80;

/**
 * Moves every item that is now behind the bus to the far end of the line.
 *
 * @param {Array<THREE.Object3D>} items - Pool members
 * @param {number} busZ - Current bus position along the road
 * @param {Object} options
 * @param {number} options.behind - How far behind the bus an item may stay
 * @param {number} options.spacing - Nominal gap between neighbours
 * @param {Function} options.place - (item, z) => void, positions one item
 * @param {Function} [options.gapFor] - (item) => number, optional per-item gap
 * @returns {number} number of items recycled
 */
export function recycleBehind(items, busZ, { behind = SCENERY_BEHIND, spacing = 30, place, gapFor }) {
    if (!items || items.length === 0) return 0;

    // The far end of the line: everything new is appended behind the last item
    let minZ = Infinity;
    for (const item of items) {
        if (Number.isFinite(item.position.z)) minZ = Math.min(minZ, item.position.z);
    }

    let recycled = 0;
    for (const item of items) {
        if (item.position.z <= busZ + behind) continue;

        const gap = gapFor ? gapFor(item) : spacing * (0.75 + Math.random() * 0.5);
        minZ -= gap;
        place(item, minZ);
        recycled += 1;

        // Never loop forever if the geometry/gaps are misconfigured
        if (recycled > items.length) break;
    }

    return recycled;
}

/**
 * Creates the endless world and returns a controller that keeps it wrapped
 * around the player.
 *
 * @param {{bus: THREE.Object3D, scene: THREE.Object3D}} options
 * @returns {Object} world controller
 */
export function createEndlessWorld({ bus, scene }) {
    const startZ = PLAYER_START_Z;

    // --- Road segments (4 lanes, baked markings) ------------------------
    const roadTexture = createRoadSegmentTexture({
        width: ROAD_WIDTH,
        shoulderWidth: SHOULDER_WIDTH
    });
    const roadMaterial = new THREE.MeshLambertMaterial({
        map: roadTexture,
        side: THREE.FrontSide,
        // Road lies almost flush on the ground: pull it toward the camera in
        // depth so the two never z-fight at a distance
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
    });
    // The texture repeats along the road (arc length), not across it
    roadTexture.wrapT = THREE.RepeatWrapping;
    const ribbonHalfWidth = ROAD_HALF_WIDTH + SHOULDER_WIDTH;

    const segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
        // Each segment owns its curved ribbon, rebuilt when it is recycled
        const nearZ = startZ + SEGMENT_LENGTH - i * SEGMENT_LENGTH;
        const ribbon = createRoadRibbon();
        fillRoadRibbon(ribbon, nearZ, ribbonHalfWidth);
        const segment = new THREE.Mesh(ribbon, roadMaterial);
        segment.position.set(0, ROAD_LIFT, nearZ - SEGMENT_LENGTH / 2);
        segment.receiveShadow = true;
        segment.userData.isRoadSegment = true;
        scene.add(segment);
        segments.push(segment);
    }

    // --- Trees ---------------------------------------------------------
    const TREES_PER_POOL = 26;
    const treeSpacing = 22;
    const trees = [];
    for (let i = 0; i < TREES_PER_POOL; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const tree = createRoadsideTree(side);
        tree.userData.lateral = tree.position.x;
        tree.userData.baseYaw = tree.rotation.y;
        placeBesideRoad(tree, startZ - i * treeSpacing, tree.userData.lateral);
        scene.add(tree);
        trees.push(tree);
    }

    // --- Dhabas (restaurants) ------------------------------------------
    // Built well back from the asphalt: `DHABA_X` is the distance from the road
    // centre to the building, and the terrace sits between it and the road.
    const DHABA_COUNT = 3;
    const dhabas = [];
    for (let i = 0; i < DHABA_COUNT; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const dhaba = createDhaba(side, i);
        dhaba.userData.lateral = side * DHABA_X;
        dhaba.userData.baseYaw = dhaba.rotation.y;
        placeBesideRoad(dhaba, startZ - 120 - i * 170, dhaba.userData.lateral);
        scene.add(dhaba);
        dhabas.push(dhaba);
    }

    // --- Petrol pumps ---------------------------------------------------
    const PUMP_COUNT = 2;
    const pumps = [];
    for (let i = 0; i < PUMP_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const pump = createPetrolPump(side, i);
        pump.userData.lateral = side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 8);
        pump.userData.baseYaw = pump.rotation.y;
        placeBesideRoad(pump, startZ - 210 - i * 320, pump.userData.lateral);
        scene.add(pump);
        pumps.push(pump);
    }

    // --- Distance boards ------------------------------------------------
    const boards = DISTANCE_BOARDS.map(config => {
        const board = createDistanceBoard(config);
        const side = config.side || -1;
        board.userData.lateral = side * DISTANCE_BOARD_X;
        board.userData.baseYaw = board.rotation.y;
        scene.add(board);
        return board;
    });
    const boardGap = 110;
    boards.forEach((board, i) => {
        placeBesideRoad(board, startZ - 60 - i * boardGap, board.userData.lateral);
    });

    // --- Reflector posts along both edges (cat's eyes on the bends) ----------
    const POST_SPACING = 30;
    const POSTS_PER_SIDE = 16;
    const postGeometry = new THREE.BoxGeometry(0.12, 0.9, 0.12);
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0xF2F2F2 });
    const capMaterial = new THREE.MeshLambertMaterial({ color: 0xFF9A1F });
    const capGeometry = new THREE.BoxGeometry(0.14, 0.18, 0.14);
    const posts = [];
    for (let i = 0; i < POSTS_PER_SIDE * 2; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const post = new THREE.Mesh(postGeometry, postMaterial);
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = 0.3;
        post.add(cap);
        post.userData.lateral = side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 0.5);
        post.userData.isRoadPost = true;
        placeBesideRoad(post, startZ + 40 - Math.floor(i / 2) * POST_SPACING, post.userData.lateral);
        post.position.y = 0.45;
        scene.add(post);
        posts.push(post);
    }

    // --- Chevron warning signs on the outside of sharp bends -------------------
    const CHEVRON_COUNT = 10;
    const CHEVRON_SPACING = 24;
    const CHEVRON_MIN_CURVATURE = 1 / 300;
    const boardGeo = new THREE.BoxGeometry(1.5, 1.1, 0.06);
    const boardMat = new THREE.MeshLambertMaterial({ color: 0xF2C200, side: THREE.DoubleSide });
    const barGeo = new THREE.BoxGeometry(0.8, 0.14, 0.08);
    const barMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
    const chevronPostGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
    const chevronPostMat = new THREE.MeshLambertMaterial({ color: 0x9A9A9A });
    const chevrons = [];
    for (let i = 0; i < CHEVRON_COUNT; i++) {
        const sign = new THREE.Group();
        const post = new THREE.Mesh(chevronPostGeo, chevronPostMat);
        post.position.y = 0.75;
        sign.add(post);
        const face = new THREE.Mesh(boardGeo, boardMat);
        face.position.y = 1.7;
        sign.add(face);
        const upper = new THREE.Mesh(barGeo, barMat);
        const lower = new THREE.Mesh(barGeo, barMat);
        upper.position.set(0, 1.7 + 0.22, 0.05);
        lower.position.set(0, 1.7 - 0.22, 0.05);
        sign.add(upper);
        sign.add(lower);
        sign.userData.bars = [upper, lower];
        sign.userData.isChevron = true;
        placeChevron(sign, startZ - 20 - i * CHEVRON_SPACING);
        scene.add(sign);
        chevrons.push(sign);
    }

    /**
     * Puts a chevron on the outside of the bend at z, or hides it on a
     * straight stretch. The arrow points the way the road turns.
     */
    function placeChevron(sign, z) {
        const turn = (roadHeading(z - 4) - roadHeading(z + 4)) / 8;   // + = bending left
        const sharp = Math.abs(turn) > CHEVRON_MIN_CURVATURE;
        sign.visible = sharp;
        const m = turn > 0 ? 1 : -1;
        const outer = m > 0 ? 1 : -1;        // outside of a left bend is the right side
        placeBesideRoad(sign, z, outer * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1.5));
        const [upper, lower] = sign.userData.bars;
        upper.position.x = lower.position.x = 0.15 * m;
        upper.rotation.z = 0.7 * m;
        lower.rotation.z = -0.7 * m;
    }

    // --- State -----------------------------------------------------------
    const state = {
        distance: 0,
        lastBusZ: bus.position.z,
        recycled: 0
    };

    /**
     * Puts a dhaba somewhere along the road, on its own side, always set back
     * from the asphalt.
     * @param {THREE.Object3D} dhaba
     * @param {number} z
     */
    function placeDhaba(dhaba, z) {
        placeBesideRoad(dhaba, z, dhaba.userData.lateral);
    }

    /**
     * Puts a petrol pump along the road on its own side of the carriageway.
     * @param {THREE.Object3D} pump
     * @param {number} z
     */
    function placePump(pump, z) {
        placeBesideRoad(pump, z, pump.userData.lateral);
    }

    /**
     * Puts one distance board somewhere along the road.
     * @param {THREE.Object3D} board
     * @param {number} z
     */
    function placeBoard(board, z) {
        placeBesideRoad(board, z, board.userData.lateral);
        board.visible = true;
    }

    /**
     * Advances the world: tracks distance driven and recycles anything that has
     * fallen behind the bus.
     *
     * @param {number} dt - Delta time in seconds (unused, kept for symmetry)
     * @returns {Object} the world state
     */
    function update(dt) { // eslint-disable-line no-unused-vars
        const busZ = bus.position.z;

        // Distance driven (the bus normally moves towards -Z)
        const delta = state.lastBusZ - busZ;
        if (delta > 0) state.distance += delta;
        state.lastBusZ = busZ;

        // --- Road segments (laid end to end) ---
        // A segment that has fallen behind is rebuilt as the next stretch of
        // curved road at the far end of the line.
        let farCentre = Infinity;
        for (const segment of segments) farCentre = Math.min(farCentre, segment.position.z);
        for (const segment of segments) {
            if (segment.position.z <= busZ + SEGMENT_RECYCLE_BEHIND) continue;
            farCentre -= SEGMENT_LENGTH;
            segment.position.z = farCentre;
            fillRoadRibbon(segment.geometry, farCentre + SEGMENT_LENGTH / 2, ribbonHalfWidth);
            state.recycled += 1;
        }

        // --- Trees ---
        recycleBehind(trees, busZ, {
            behind: SCENERY_BEHIND,
            spacing: treeSpacing,
            place: (tree, z) => placeBesideRoad(tree, z, tree.userData.lateral)
        });

        // --- Reflector posts (one pool per side, kept level with each other) ---
        recycleBehind(posts, busZ, {
            behind: SCENERY_BEHIND,
            spacing: POST_SPACING / 2,
            gapFor: () => POST_SPACING / 2,
            place: (post, z) => {
                placeBesideRoad(post, z, post.userData.lateral);
                post.position.y = 0.45;
            }
        });

        // --- Chevron signs ---
        recycleBehind(chevrons, busZ, {
            behind: SCENERY_BEHIND,
            spacing: CHEVRON_SPACING,
            gapFor: () => CHEVRON_SPACING,
            place: placeChevron
        });

        // --- Dhabas: generous gaps so the terraces never overlap ---
        recycleBehind(dhabas, busZ, {
            behind: SCENERY_BEHIND + 60,
            spacing: DHABA_GAP_MIN,
            gapFor: () => DHABA_GAP_MIN + Math.random() * (DHABA_GAP_MAX - DHABA_GAP_MIN),
            place: placeDhaba
        });

        // --- Petrol pumps ---
        recycleBehind(pumps, busZ, {
            behind: SCENERY_BEHIND + 60,
            spacing: 320,
            gapFor: () => 260 + Math.random() * 180,
            place: placePump
        });

        // --- Distance boards ---
        recycleBehind(boards, busZ, {
            behind: SCENERY_BEHIND,
            spacing: boardGap,
            gapFor: () => 150 + Math.random() * 60,
            place: placeBoard
        });

        return state;
    }

    /**
     * How far the bus has actually driven (used by the HUD).
     * @returns {number}
     */
    function travelledDistance() {
        return state.distance;
    }

    return {
        segments,
        trees,
        dhabas,
        pumps,
        boards,
        posts,
        chevrons,
        update,
        travelledDistance,
        getState: () => ({
            distance: state.distance,
            segmentCount: segments.length,
            dhabaCount: dhabas.length,
            pumpCount: pumps.length,
            boardCount: boards.length
        }),
        /** Nominal road length ahead of the spawn point */
        roadLength: ROAD_LENGTH
    };
}
