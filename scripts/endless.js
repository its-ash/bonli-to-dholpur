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
        side: THREE.FrontSide
    });
    const roadGeometry = new THREE.PlaneGeometry(
        ROAD_WIDTH + SHOULDER_WIDTH * 2,
        SEGMENT_LENGTH
    );

    const segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
        const segment = new THREE.Mesh(roadGeometry, roadMaterial);
        segment.rotation.x = -Math.PI / 2;
        segment.position.set(0, 0.01, startZ - i * SEGMENT_LENGTH - SEGMENT_LENGTH / 2);
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
        tree.position.z = startZ - i * treeSpacing;
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
        dhaba.position.set(side * DHABA_X, 0, startZ - 120 - i * 170);
        scene.add(dhaba);
        dhabas.push(dhaba);
    }

    // --- Petrol pumps ---------------------------------------------------
    const PUMP_COUNT = 2;
    const pumps = [];
    for (let i = 0; i < PUMP_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const pump = createPetrolPump(side, i);
        pump.position.set(side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 8), 0, startZ - 210 - i * 320);
        scene.add(pump);
        pumps.push(pump);
    }

    // --- Distance boards ------------------------------------------------
    const boards = DISTANCE_BOARDS.map(config => {
        const board = createDistanceBoard(config);
        const side = config.side || -1;
        board.position.set(side * DISTANCE_BOARD_X, 0, 0);
        scene.add(board);
        return board;
    });
    const boardGap = 110;
    boards.forEach((board, i) => {
        board.position.z = startZ - 60 - i * boardGap;
    });

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
        dhaba.position.z = z;
        dhaba.position.x = dhaba.userData.side * DHABA_X;
    }

    /**
     * Puts a petrol pump along the road on its own side of the carriageway.
     * @param {THREE.Object3D} pump
     * @param {number} z
     */
    function placePump(pump, z) {
        pump.position.z = z;
        pump.position.x = pump.userData.side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 8);
    }

    /**
     * Puts one distance board somewhere along the road.
     * @param {THREE.Object3D} board
     * @param {number} z
     */
    function placeBoard(board, z) {
        board.position.z = z;
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
        state.recycled += recycleBehind(segments, busZ, {
            behind: SEGMENT_RECYCLE_BEHIND,
            spacing: SEGMENT_LENGTH,
            place: (segment, z) => {
                segment.position.z = z + SEGMENT_LENGTH / 2;
            }
        });

        // --- Trees ---
        recycleBehind(trees, busZ, {
            behind: SCENERY_BEHIND,
            spacing: treeSpacing,
            place: (tree, z) => { tree.position.z = z; }
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
