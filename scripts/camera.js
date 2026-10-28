// =============================================
// CAMERA SYSTEM
// =============================================

import * as THREE from 'three';
import {
    CAMERA_OFFSET, CAMERA_DAMPING,
    CAMERA_MOBILE_ZOOM, CAMERA_DESKTOP_ZOOM
} from './constants.js';

/**
 * Creates and returns a camera update function.
 *
 * The controller supports a zoom factor so the same follow-camera works on a
 * phone: a narrow portrait viewport gets a pulled-back camera, which keeps the
 * road ahead and the scenery readable.
 *
 * @param {THREE.Camera} camera - The camera to update
 * @param {THREE.Object3D} target - The target to follow (bus)
 * @returns {Function} updateCamera function, with a setZoom(z) method
 */
export function createCameraController(camera, target) {
    // Base offset, scaled by the current zoom
    const baseOffset = new THREE.Vector3(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
    const offset = baseOffset.clone();
    let zoom = CAMERA_DESKTOP_ZOOM;

    /**
     * Sets how far back the camera sits.
     * 1 = the default desktop framing, >1 = zoomed out (further away).
     *
     * @param {number} value - Zoom factor (clamped to a sane range)
     */
    function setZoom(value) {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        zoom = Math.min(2.5, Math.max(0.5, next));
        offset.copy(baseOffset).multiplyScalar(zoom);
    }

    // Rotates a local offset by the target's heading (yaw) only, so the bus's
    // body lean and roll never tilt or shake the camera
    function aroundTarget(x, y, z) {
        const cos = Math.cos(target.rotation.y);
        const sin = Math.sin(target.rotation.y);
        return new THREE.Vector3(
            target.position.x + x * cos + z * sin,
            target.position.y + y,
            target.position.z - x * sin + z * cos
        );
    }

    function updateCamera(dt) {
        // Calculate target position: offset rotated by target heading
        const targetPos = aroundTarget(offset.x, offset.y, offset.z);

        // Smooth lerp using exponential damping: 1 - exp(-k*dt)
        const dampingFactor = 1 - Math.exp(-CAMERA_DAMPING * dt);

        camera.position.lerp(targetPos, dampingFactor);

        // Look at the target (slightly ahead for better view)
        camera.lookAt(aroundTarget(0, 1.5, -3));
    }

    updateCamera.setZoom = setZoom;
    updateCamera.getZoom = () => zoom;

    return updateCamera;
}

/**
 * Picks the zoom factor for the current viewport.
 *
 * Portrait / phone-sized screens get the pulled-back mobile framing; wide
 * desktop windows keep the original framing.
 *
 * @param {number} width - Viewport width in CSS pixels
 * @param {number} height - Viewport height in CSS pixels
 * @returns {number} zoom factor
 */
export function zoomForViewport(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
        return CAMERA_DESKTOP_ZOOM;
    }

    // A phone in portrait is narrow: fewer pixels across than this means the
    // road fills too much of the frame at the desktop distance.
    const narrow = width <= 820;
    const portrait = height > width;

    return (narrow || portrait) ? CAMERA_MOBILE_ZOOM : CAMERA_DESKTOP_ZOOM;
}
