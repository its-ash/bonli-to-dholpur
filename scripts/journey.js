// =============================================
// JOURNEY - the trip meter for the endless road
// There is no finish line any more: the road keeps going and the journey only
// tracks how far the bus has driven, how long the drive has lasted, and which
// town the distance boards are pointing at.
// =============================================

import { DISTANCE_BOARDS } from './constants.js';

export const JOURNEY_STATUS = {
    DRIVING: 'driving'
};

/**
 * Creates the trip meter.
 *
 * @param {THREE.Object3D} bus - The player bus
 * @returns {{
 *   status: string,
 *   distance: number,
 *   elapsed: number,
 *   nextTown: {name: string, km: number},
 *   update: (dt: number) => void,
 *   getState: () => Object
 * }}
 */
export function createJourney(bus) {
    const state = {
        distance: 0,   // metres driven
        elapsed: 0,    // seconds driven
        lastZ: bus && bus.position ? bus.position.z : 0
    };

    /**
     * Advances the trip meter. Only forward motion (towards -Z) counts, so
     * reversing does not inflate the distance.
     *
     * @param {number} dt - Delta time in seconds
     */
    function update(dt) {
        state.elapsed += dt;
        if (!bus) return;

        const delta = state.lastZ - bus.position.z;
        if (delta > 0) state.distance += delta;
        state.lastZ = bus.position.z;
    }

    /**
     * The next town on the boards, scaled down as the bus gets closer.
     * The boards are static scenery, so this is only a rough progress hint for
     * the HUD - it never reaches zero and keeps cycling.
     * @returns {{name: string, km: number}}
     */
    function nextTown() {
        const board = DISTANCE_BOARDS[0] || { name: 'बौंली', km: 12 };
        // One "kilometre" of board distance per 60 metres of road
        const remaining = Math.max(0, board.km - state.distance / 60);
        return { name: board.name, km: Math.round(remaining * 10) / 10 };
    }

    return {
        get status() { return JOURNEY_STATUS.DRIVING; },
        get distance() { return state.distance; },
        get elapsed() { return state.elapsed; },
        get nextTown() { return nextTown(); },
        update,
        getState: () => ({
            status: JOURNEY_STATUS.DRIVING,
            distance: state.distance,
            elapsed: state.elapsed,
            distanceKm: Math.round(state.distance / 100) / 10,
            nextTown: nextTown()
        })
    };
}
