// =============================================
// PEDESTRIANS
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, GRASS_WIDTH, PLAYER_START_Z } from './constants.js';

// Pedestrians are recycled around the player like the rest of the world: they
// live in a window ahead of / behind the bus and are moved back into view.
const PED_AHEAD = 220;
const PED_BEHIND = 60;

const PEDESTRIAN_HEIGHT = 1.1;
const PEDESTRIAN_VARIANTS = [
    { bodyColor: 0xE8C5A0, shirtColor: 0xE74C3C, pantsColor: 0x2C3E50 }, // Light skin, red shirt
    { bodyColor: 0xD4A574, shirtColor: 0x3498DB, pantsColor: 0x1A1A2E }, // Medium skin, blue shirt
    { bodyColor: 0x8D6E63, shirtColor: 0x2ECC71, pantsColor: 0x3E2723 }  // Dark skin, green shirt
];

/**
 * Creates a blocky pedestrian character
 * @param {number} variant - Variant index (0-2)
 * @returns {THREE.Group} Pedestrian group
 */
export function createPedestrian(variant = 0) {
    const pedGroup = new THREE.Group();
    const colors = PEDESTRIAN_VARIANTS[variant % PEDESTRIAN_VARIANTS.length];

    // Body parts dimensions
    const headSize = 0.25;
    const bodyWidth = 0.35;
    const bodyHeight = 0.5;
    const bodyDepth = 0.2;
    const limbWidth = 0.12;
    const limbHeight = 0.4;
    const limbDepth = 0.12;

    // --- Head ---
    const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
    const headMaterial = new THREE.MeshLambertMaterial({
        color: colors.bodyColor,
        flatShading: true
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = PEDESTRIAN_HEIGHT - headSize / 2;
    head.castShadow = true;
    pedGroup.add(head);

    // --- Body ---
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const bodyMaterial = new THREE.MeshLambertMaterial({
        color: colors.shirtColor,
        flatShading: true
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = PEDESTRIAN_HEIGHT - headSize - bodyHeight / 2 - 0.02;
    body.castShadow = true;
    pedGroup.add(body);

    // --- Legs ---
    const legGeometry = new THREE.BoxGeometry(limbWidth, limbHeight, limbDepth);
    const legMaterial = new THREE.MeshLambertMaterial({
        color: colors.pantsColor,
        flatShading: true
    });

    const legY = limbHeight / 2;
    const legOffsetX = bodyWidth / 2 - limbWidth / 2 + 0.02;

    [-1, 1].forEach(side => {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(side * legOffsetX, legY, 0);
        leg.castShadow = true;
        pedGroup.add(leg);
    });

    // --- Arms ---
    const armGeometry = new THREE.BoxGeometry(limbWidth, limbHeight * 0.8, limbDepth);
    const armMaterial = new THREE.MeshLambertMaterial({
        color: colors.bodyColor,
        flatShading: true
    });

    const armY = PEDESTRIAN_HEIGHT - headSize - bodyHeight * 0.3;
    const armOffsetX = bodyWidth / 2 + limbWidth / 2;

    [-1, 1].forEach(side => {
        const arm = new THREE.Mesh(armGeometry, armMaterial);
        arm.position.set(side * armOffsetX, armY, 0);
        arm.castShadow = true;
        pedGroup.add(arm);
    });

    // Store pedestrian properties
    pedGroup.userData = {
        walkSpeed: 1.5 + Math.random() * 1.0,
        walkRange: 5 + Math.random() * 5,
        startX: 0,
        startZ: 0,
        direction: Math.random() > 0.5 ? 1 : -1,
        walkPhase: Math.random() * Math.PI * 2
    };

    return pedGroup;
}

/**
 * Creates and places pedestrians along road edges
 * @param {number} count - Number of pedestrians to create
 * @returns {Array<THREE.Group>} Array of pedestrian groups
 */
export function makePedestrians(count = 8) {
    const pedestrians = [];
    
    const sidewalkStartX = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1;
    const sidewalkEndX = sidewalkStartX + GRASS_WIDTH;
    
    for (let i = 0; i < count; i++) {
        const ped = createPedestrian(i % 3);
        
        const side = Math.random() > 0.5 ? 1 : -1;
        const baseX = side * (sidewalkStartX + Math.random() * (sidewalkEndX - sidewalkStartX));
        const baseZ = PLAYER_START_Z - 20 - Math.random() * (PED_AHEAD - 40);
        
        ped.position.set(baseX, 0, baseZ);
        ped.userData.startX = baseX;
        ped.userData.startZ = baseZ;
        
        // Face walking direction
        ped.rotation.y = ped.userData.direction > 0 ? 0 : Math.PI;
        
        pedestrians.push(ped);
    }

    return pedestrians;
}

/**
 * Updates all pedestrians (walking back and forth).
 * Pedestrians that fall outside the window around the bus are moved back in
 * front of the player, so there are always people along the endless road.
 *
 * @param {Array<THREE.Group>} pedestrians - Array of pedestrian groups
 * @param {number} dt - Delta time in seconds
 * @param {THREE.Object3D} [bus] - Player bus, used to recycle the walkers
 */
export function updatePedestrians(pedestrians, dt, bus) {
    pedestrians.forEach(ped => {
        const data = ped.userData;
        
        // Walk back and forth along X axis (perpendicular to road)
        data.walkPhase += data.walkSpeed * dt * 0.5;
        const walkOffset = Math.sin(data.walkPhase) * data.walkRange * 0.5;
        
        ped.position.x = data.startX + walkOffset * data.direction;
        
        // Update facing direction based on movement
        const currentDirection = Math.sin(data.walkPhase) > 0 ? 1 : -1;
        ped.rotation.y = currentDirection > 0 ? 0 : Math.PI;

        // Keep the walkers wrapped around the player on the endless road
        if (bus) {
            const behind = ped.position.z > bus.position.z + PED_BEHIND;
            const farAhead = ped.position.z < bus.position.z - PED_AHEAD;

            if (behind || farAhead) {
                ped.position.z = bus.position.z - 40 - Math.random() * (PED_AHEAD - 80);
                data.startZ = ped.position.z;
            }
        }
    });
}