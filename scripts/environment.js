// =============================================
// ENVIRONMENT - Sky, Ground, Lighting, Trees
// A soft pastel "floating landscape amusement park" look: gradient sky, warm
// soft lighting, mint grass and rounded lollipop trees that sway in the wind.
// The road itself is endless and lives in scripts/endless.js.
// =============================================

import * as THREE from 'three';
import {
    ROAD_HALF_WIDTH, SHOULDER_WIDTH,
    COLORS, TREE_BASE_X_OFFSET, TREE_JITTER_X,
    SHADOW_CAMERA, SHADOW_MAP_SIZE
} from './constants.js';
import { createSkyTexture, createSunGlow, createGrassTexture } from './utils.js';

/**
 * Applies the look-defining renderer settings (sRGB output, soft filmic tone
 * mapping, soft shadows). Call once right after creating the WebGLRenderer.
 * @param {THREE.WebGLRenderer} renderer
 */
export function configureRenderer(renderer) {
    if (!renderer) return;
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// ---------------------------------------------------------------- wind sway
// One shared clock drives every swaying material (vertex shader, no per-frame
// JS per tree). landscape.update() advances it through updateEnvironment().
export const swayTime = { value: 0 };

/**
 * Makes a material bend gently in the wind: vertices move sideways more the
 * higher they are, with a phase taken from the (instance) position.
 * @param {THREE.Material} material
 * @param {number} amount - Sway strength (world units per unit of height)
 * @returns {THREE.Material}
 */
export function makeSway(material, amount = 0.035) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSwayTime = swayTime;
        shader.uniforms.uSwayAmount = { value: amount };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>',
                '#include <common>\nuniform float uSwayTime;\nuniform float uSwayAmount;')
            .replace('#include <begin_vertex>',
                `#include <begin_vertex>
                #ifdef USE_INSTANCING
                    vec3 swayOrigin = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
                #else
                    vec3 swayOrigin = vec3(0.0);
                #endif
                float swayPhase = uSwayTime * 1.4 + (modelMatrix[3][0] + swayOrigin.x) * 0.35 + (modelMatrix[3][2] + swayOrigin.z) * 0.27;
                float swayH = max(position.y, 0.0);
                transformed.x += sin(swayPhase) * uSwayAmount * swayH;
                transformed.z += cos(swayPhase * 0.8) * uSwayAmount * 0.6 * swayH;`);
    };
    material.customProgramCacheKey = () => 'sway-' + amount;
    return material;
}

/** Advances the ambient animation shared by the environment (tree sway). */
export function updateEnvironment(dt) {
    swayTime.value += dt;
}

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
    // --- Sun (DirectionalLight): warm and soft ---
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
    sun.shadow.radius = 3;

    const sunTarget = new THREE.Object3D();

    // --- Hemisphere Light: strong sky/peach fill keeps shadows gentle ---
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

/**
 * Moves the sun (and its target) to follow `focus`, but only in whole
 * shadow-map texels along the light's own right/up axes. A continuously moving
 * shadow camera makes every shadow edge crawl and flicker.
 */
export function snapSunToTexels(sun, sunTarget, focus, offset) {
    // Plain maths (no Vector3 helpers) to keep it cheap and allocation-free
    const dl = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const dx = offset.x / dl, dy = offset.y / dl, dz = offset.z / dl;
    // right = worldUp x dir
    let rx = dz, rz = -dx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    // up = dir x right
    const ux = dy * rz, uy = dz * rx - dx * rz, uz = -dy * rx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const upx = ux / ul, upy = uy / ul, upz = uz / ul;
    const texel = (SHADOW_CAMERA.right - SHADOW_CAMERA.left) / SHADOW_MAP_SIZE;
    const a = focus.x * rx + focus.z * rz;
    const b = focus.x * upx + focus.z * upz; // ignore bus bounce (y)
    const da = Math.round(a / texel) * texel - a;
    const db = Math.round(b / texel) * texel - b;
    const tx = focus.x + rx * da + upx * db;
    const ty = upy * db;
    const tz = focus.z + rz * da + upz * db;
    sunTarget.position.set(tx, ty, tz);
    sun.position.set(tx + offset.x, ty + offset.y, tz + offset.z);
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
    // Soft mint/lime grass, tiled across the ground plane
    const grassTexture = createGrassTexture();
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

// --- Shared tree geometry and materials (one of each, reused by every tree) ---
let treeAssets = null;

function getTreeAssets() {
    if (treeAssets) return treeAssets;
    const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 1, 8);
    if (trunkGeometry.translate) trunkGeometry.translate(0, 0.5, 0);
    const crownGeometry = new THREE.IcosahedronGeometry(1, 2);
    treeAssets = {
        trunkGeometry,
        crownGeometry,
        trunkMaterial: makeSway(new THREE.MeshLambertMaterial({ color: COLORS.TREE_TRUNK }), 0.02),
        crownMaterials: COLORS.TREE_FOLIAGE.map(color =>
            makeSway(new THREE.MeshLambertMaterial({ color }), 0.05))
    };
    return treeAssets;
}

/**
 * Creates a single rounded "lollipop" tree: a slim trunk topped by one or two
 * soft pastel balls. Geometry and materials are shared between all trees.
 * @returns {THREE.Group}
 */
export function createTree() {
    const assets = getTreeAssets();
    const treeGroup = new THREE.Group();

    const scale = 0.9 + Math.random() * 0.6;
    const crownMaterial = assets.crownMaterials[Math.floor(Math.random() * assets.crownMaterials.length)];

    const trunkHeight = 2.2;
    const trunk = new THREE.Mesh(assets.trunkGeometry, assets.trunkMaterial);
    trunk.scale.set(1, trunkHeight, 1);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Main crown ball; sometimes a smaller second ball on top (stacked toy tree)
    const crown = new THREE.Mesh(assets.crownGeometry, crownMaterial);
    const crownRadius = 1.5;
    crown.scale.set(crownRadius, crownRadius * 0.92, crownRadius);
    crown.position.y = trunkHeight + crownRadius * 0.75;
    crown.castShadow = true;
    crown.receiveShadow = true;
    treeGroup.add(crown);

    if (Math.random() < 0.4) {
        const top = new THREE.Mesh(assets.crownGeometry, crownMaterial);
        top.scale.set(1.0, 0.9, 1.0);
        top.position.y = crown.position.y + crownRadius * 0.95;
        top.castShadow = true;
        treeGroup.add(top);
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
