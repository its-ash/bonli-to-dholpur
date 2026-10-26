// =============================================
// ENVIRONMENT - Sky, Ground, Lighting, Trees
// The road itself is endless and lives in scripts/endless.js; this module only
// owns the things that are the same everywhere: sky, sun, ground and trees.
// =============================================

import * as THREE from 'three';
import {
    ROAD_HALF_WIDTH, SHOULDER_WIDTH,
    COLORS, TREE_BASE_X_OFFSET, TREE_JITTER_X,
    SHADOW_CAMERA, SHADOW_MAP_SIZE
} from './constants.js';
import { createSkyTexture, createSunGlow, createPixelNoiseTexture } from './utils.js';

/**
 * Creates the sky dome with gradient texture
 * @returns {THREE.Mesh}
 */
export function createSkyDome() {
    const texture = createSkyTexture();

    // Big enough that the camera can never poke through it
    const geometry = new THREE.SphereGeometry(900, 32, 32);
    geometry.scale(-1, 1, 1); // Flip normals inward

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        fog: false,
        depthWrite: false,
        // The geometry above is already inverted by scale(-1, 1, 1), so its
        // front faces point inward. Using BackSide here (as well as flipping)
        // culled the whole dome and left a black horizon band.
        side: THREE.FrontSide
    });

    const skyDome = new THREE.Mesh(geometry, material);
    skyDome.renderOrder = -1;
    // Draw the sky behind everything, and never let it be culled by frustum
    // culling as it travels with the camera.
    skyDome.frustumCulled = false;
    return skyDome;
}

/**
 * Creates the lighting system (sun, hemisphere light, sun glow).
 * The sun's target is returned too: the endless world moves it with the bus so
 * the shadow map always covers the road around the player.
 *
 * @returns {Object} { sun, sunTarget, hemiLight, sunGlow }
 */
export function createLighting() {
    // --- Sun (DirectionalLight) ---
    const sun = new THREE.DirectionalLight(COLORS.SUN_COLOR, COLORS.SUN_INTENSITY);
    sun.position.set(COLORS.SUN_POSITION.x, COLORS.SUN_POSITION.y, COLORS.SUN_POSITION.z);
    sun.castShadow = true;

    // Configure shadow camera to cover the play area
    sun.shadow.camera.left = SHADOW_CAMERA.left;
    sun.shadow.camera.right = SHADOW_CAMERA.right;
    sun.shadow.camera.top = SHADOW_CAMERA.top;
    sun.shadow.camera.bottom = SHADOW_CAMERA.bottom;
    sun.shadow.camera.near = SHADOW_CAMERA.near;
    sun.shadow.camera.far = SHADOW_CAMERA.far;
    sun.shadow.mapSize.width = SHADOW_MAP_SIZE;
    sun.shadow.mapSize.height = SHADOW_MAP_SIZE;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;

    const sunTarget = new THREE.Object3D();

    // --- Hemisphere Light (ambient fill) ---
    const hemiLight = new THREE.HemisphereLight(
        COLORS.HEMI_SKY,
        COLORS.HEMI_GROUND,
        COLORS.HEMI_INTENSITY
    );

    // --- Sun Glow Sprite ---
    const sunGlow = createSunGlow();
    const sunDir = new THREE.Vector3(
        COLORS.SUN_POSITION.x,
        COLORS.SUN_POSITION.y,
        COLORS.SUN_POSITION.z
    ).normalize();
    sunGlow.position.copy(sunDir).multiplyScalar(400);

    return { sun, sunTarget, hemiLight, sunGlow };
}

// The ground plane's texture tiles at this many world units, so snapping the
// plane to a multiple of it keeps the grass perfectly still while it follows
// the bus.
export const GROUND_SIZE = 1200;
export const GROUND_TILES = 200;
export const GROUND_TILE_SIZE = GROUND_SIZE / GROUND_TILES;

/**
 * Creates the ground plane (the road is laid on top of it).
 *
 * Because the road is endless, the ground has to travel with the player - see
 * followGroundAndSky().
 *
 * @returns {THREE.Mesh}
 */
export function createGround() {
    // Blocky dithered grass texture, tiled across the ground plane
    const grassTexture = createPixelNoiseTexture(COLORS.GRASS_PIXELS, 32);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(GROUND_TILES, GROUND_TILES);

    const groundGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMaterial = new THREE.MeshLambertMaterial({
        map: grassTexture
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    return ground;
}

/**
 * Keeps the ground and sky centred on the player.
 *
 * Without this the bus eventually drives off the edge of the (finite) ground
 * plane and the sky dome, and everything beside the road turns black. The
 * ground is snapped to whole texture tiles so the grass never appears to slide.
 *
 * @param {THREE.Mesh} ground
 * @param {THREE.Mesh} skyDome
 * @param {THREE.Object3D} target - Usually the player bus
 */
export function followGroundAndSky(ground, skyDome, target) {
    if (!ground || !target || !target.position) return;

    // Snap to the texture tile grid: shifting by a whole tile is invisible
    const tile = GROUND_TILE_SIZE;
    ground.position.x = Math.round(target.position.x / tile) * tile;
    ground.position.z = Math.round(target.position.z / tile) * tile;

    // The sky is a smooth gradient, so it can simply follow exactly
    if (skyDome && skyDome.position) {
        skyDome.position.x = target.position.x;
        skyDome.position.z = target.position.z;
    }
}

/**
 * Creates a single low-poly tree
 * @returns {THREE.Group}
 */
export function createTree() {
    const treeGroup = new THREE.Group();

    const scale = 0.8 + Math.random() * 0.6;
    const foliageColor = COLORS.TREE_FOLIAGE[Math.floor(Math.random() * COLORS.TREE_FOLIAGE.length)];

    const trunkHeight = 1.5 * scale;
    const trunkRadius = 0.3 * scale;

    // --- Trunk ---
    const trunkGeometry = new THREE.BoxGeometry(trunkRadius * 2, trunkHeight, trunkRadius * 2);
    const trunkMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.TREE_TRUNK,
        flatShading: true
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // --- Foliage (stacked boxes) ---
    const foliageLayerCount = 3 + Math.floor(Math.random() * 2);
    const baseFoliageSize = 1.8 * scale;

    for (let i = 0; i < foliageLayerCount; i++) {
        const layerProgress = i / (foliageLayerCount - 1);
        const layerSize = baseFoliageSize * (1 - layerProgress * 0.5);
        const layerHeight = 0.8 * scale;

        const layerY = trunkHeight + layerHeight / 2 + i * (layerHeight * 0.7);

        const foliageGeometry = new THREE.BoxGeometry(layerSize, layerHeight, layerSize);

        const layerColor = new THREE.Color(foliageColor);
        layerColor.multiplyScalar(1 - layerProgress * 0.15);

        const foliageMaterial = new THREE.MeshLambertMaterial({
            color: layerColor,
            flatShading: true
        });

        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = layerY;
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        treeGroup.add(foliage);
    }

    treeGroup.scale.setScalar(scale);
    return treeGroup;
}

/**
 * Builds one recycled roadside tree placed by the endless world.
 * @param {number} side - -1 (left of the road) or +1 (right)
 * @returns {THREE.Group}
 */
export function createRoadsideTree(side = 1) {
    const tree = createTree();
    const baseX = ROAD_HALF_WIDTH + SHOULDER_WIDTH + TREE_BASE_X_OFFSET;
    const jitterX = (Math.random() - 0.5) * TREE_JITTER_X;

    tree.position.set(side * (baseX + jitterX), 0, 0);
    tree.rotation.y = Math.random() * Math.PI * 2;
    return tree;
}
