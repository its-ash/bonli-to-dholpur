// =============================================
// CAMERA SYSTEM
// =============================================

import * as THREE from 'three';
import {
    CAMERA_OFFSET, CAMERA_DAMPING,
    CAMERA_MOBILE_ZOOM, CAMERA_DESKTOP_ZOOM, ANIM
} from './constants.js';
import { roundedBox } from './rounded.js';

export const CAMERA_MODES = ['chase', 'cockpit', 'cinematic'];
export const CAMERA_MODE_LABELS = { chase: 'Chase', cockpit: 'Cockpit', cinematic: 'Cinematic' };

// Driver's eye in bus-local space (the bus faces -Z, drives on the right seat)
const COCKPIT_EYE = { x: 0.62, y: 2.3, z: -3.3 };

/**
 * Builds the driver's dashboard: a dash panel, windscreen pillars, a steering
 * wheel that turns with the steering and two needle gauges. It is attached to
 * the bus and only shown in the cockpit view.
 * @param {THREE.Object3D} bus
 * @returns {THREE.Group}
 */
function createCockpit(bus) {
    const group = new THREE.Group();
    group.name = 'cockpit';
    const dark = new THREE.MeshLambertMaterial({ color: 0x4B4F63 });
    const soft = new THREE.MeshLambertMaterial({ color: 0x8E7FA0 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xFFE29A });
    const face = new THREE.MeshBasicMaterial({ color: 0xFFFAF4 });
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xD9534F });

    const add = (geo, mat, x, y, z, parent = group) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    };

    // Dash top and the slope down to the floor
    add(roundedBox(2.3, 0.28, 0.7), dark, 0, 1.62, -4.4);
    add(roundedBox(2.3, 0.7, 0.2), soft, 0, 1.3, -4.1);
    // Instrument hood
    add(roundedBox(0.9, 0.12, 0.3), dark, 0.62, 1.95, -4.28);
    // Windscreen frame: pillars and header
    add(roundedBox(0.1, 1.5, 0.12), trim, -1.14, 2.4, -4.75);
    add(roundedBox(0.1, 1.5, 0.12), trim, 1.14, 2.4, -4.75);
    add(roundedBox(0.06, 1.45, 0.08), trim, 0, 2.4, -4.75);
    add(roundedBox(2.3, 0.12, 0.12), trim, 0, 3.1, -4.75);

    // Steering wheel (turns about its own axis, tilted towards the driver)
    const wheelTilt = new THREE.Group();
    wheelTilt.position.set(COCKPIT_EYE.x, 1.78, -4.0);
    wheelTilt.rotation.x = -0.95;
    group.add(wheelTilt);
    const wheel = new THREE.Group();
    wheelTilt.add(wheel);
    add(new THREE.TorusGeometry(0.27, 0.035, 8, 20), dark, 0, 0, 0, wheel);
    add(roundedBox(0.5, 0.045, 0.045), dark, 0, 0, 0, wheel);
    add(roundedBox(0.045, 0.27, 0.045), dark, 0, -0.13, 0, wheel);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 10), trim, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
    // a coloured mark at the top shows the rotation
    add(roundedBox(0.06, 0.03, 0.05), needleMat, 0, 0.27, 0.03, wheel);

    // Gauges above the wheel: speedometer and tachometer needles
    const needles = [];
    [0.4, 0.84].forEach(x => {
        const disc = add(new THREE.CircleGeometry(0.12, 20), face, x, 1.88, -4.13);
        disc.rotation.x = -0.5;
        const pivot = new THREE.Group();
        pivot.position.set(x, 1.88, -4.125);
        pivot.rotation.x = -0.5;
        const needle = add(roundedBox(0.012, 0.1, 0.004), needleMat, 0, 0.05, 0, pivot);
        group.add(pivot);
        needles.push(pivot);
    });

    group.userData = { wheel, speedNeedle: needles[0], rpmNeedle: needles[1] };
    if (group.traverse) group.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    bus.add(group);
    if (bus.userData) bus.userData.cockpit = group;
    return group;
}

/** Turns the steering wheel and gauge needles to match the bus. */
function updateCockpitDials(cockpit, data) {
    const u = cockpit.userData;
    // Wheel turns up to 1.5 turns lock to lock (positive steer = left = anticlockwise)
    u.wheel.rotation.z = (data.steer || 0) * 2.6;
    const maxSpeed = data.maxSpeed || 25;
    const spd = Math.min(1, Math.abs(data.speed || 0) / maxSpeed);
    const rpm = Math.min(1, Math.max(0, ((data.rpm || 750) - 500) / 2400));
    u.speedNeedle.rotation.z = 2.35 - spd * 4.7;
    u.rpmNeedle.rotation.z = 2.35 - rpm * 4.7;
}

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

    let speedBlend = 0;
    const baseFov = camera.fov || ANIM.CAM_FOV_BASE;
    const baseNear = camera.near || 0.5;

    // --- Camera modes (C cycles them) ---
    let mode = CAMERA_MODES[0];
    let modeTime = 0;
    const listeners = [];
    const cockpit = target.userData && target.userData.cockpit
        ? target.userData.cockpit
        : createCockpit(target);
    cockpit.visible = false;
    const tmpEye = new THREE.Vector3();
    const tmpLook = new THREE.Vector3();

    function setMode(next) {
        if (!CAMERA_MODES.includes(next) || next === mode) return mode;
        mode = next;
        modeTime = 0;
        cockpit.visible = mode === 'cockpit';
        camera.near = mode === 'cockpit' ? 0.1 : baseNear;
        if (camera.isPerspectiveCamera) {
            camera.fov = mode === 'cockpit' ? 72 : mode === 'cinematic' ? 38 : baseFov;
            camera.updateProjectionMatrix();
        }
        // Hard cut into the cabin; the other views glide from where they are
        if (mode === 'cockpit') placeInCockpit(0);
        listeners.forEach(fn => fn(mode));
        return mode;
    }

    function cycleMode() {
        return setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length]);
    }

    // Driver's eye: right-hand seat, looking down the road. Follows the bus body
    // (so it bends with the road), glances into the turn a little.
    function placeInCockpit(dt) {
        target.updateMatrixWorld(true);
        const steer = (target.userData && target.userData.steer) || 0;
        tmpEye.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z);
        target.localToWorld(tmpEye);
        tmpLook.set(COCKPIT_EYE.x - steer * 6, COCKPIT_EYE.y - 0.25, COCKPIT_EYE.z - 40);
        target.localToWorld(tmpLook);
        camera.position.copy(tmpEye);
        camera.up.set(0, 1, 0);
        camera.lookAt(tmpLook);
    }

    // Far side view: a roadside camera that drifts from ahead of the bus to
    // behind it while keeping it in frame
    function updateCinematic(dt) {
        const sway = Math.sin(modeTime * 0.15);
        const targetPos = aroundTarget(-26, 5 + sway * 1.2, -14 + sway * 20);
        camera.position.lerp(targetPos, 1 - Math.exp(-2 * dt));
        if (camera.position.y < 1.5) camera.position.y = 1.5;
        camera.lookAt(aroundTarget(0, 1.8, -2));
    }

    function updateCamera(dt) {
        modeTime += dt;
        if (mode === 'cockpit') {
            placeInCockpit(dt);
            updateCockpitDials(cockpit, target.userData || {});
            return;
        }
        if (mode === 'cinematic') {
            updateCinematic(dt);
            return;
        }
        // Smoothed 0..1 speed fraction drives a gentle pull-back and FOV widen
        const topSpeed = target.userData && target.userData.maxSpeed || 25;
        const speedNow = Math.min(1, Math.abs((target.userData && target.userData.speed) || 0) / topSpeed);
        speedBlend += (speedNow - speedBlend) * (1 - Math.exp(-2.5 * dt));

        // Calculate target position: offset rotated by target heading
        const pull = 1 + ANIM.CAM_PULLBACK * speedBlend;
        const targetPos = aroundTarget(offset.x * pull, offset.y * (1 + 0.04 * speedBlend), offset.z * pull);

        if (camera.isPerspectiveCamera) {
            const fov = baseFov + ANIM.CAM_FOV_SPEED * speedBlend;
            if (Math.abs(camera.fov - fov) > 0.02) {
                camera.fov = fov;
                camera.updateProjectionMatrix();
            }
        }

        // Smooth lerp using exponential damping: 1 - exp(-k*dt)
        const dampingFactor = 1 - Math.exp(-CAMERA_DAMPING * dt);

        camera.position.lerp(targetPos, dampingFactor);

        // Look at the target (slightly ahead for better view)
        camera.lookAt(aroundTarget(0, 1.5, -3));
    }

    updateCamera.setZoom = setZoom;
    updateCamera.getZoom = () => zoom;
    updateCamera.setMode = setMode;
    updateCamera.cycleMode = cycleMode;
    updateCamera.getMode = () => mode;
    updateCamera.onModeChange = (fn) => { if (typeof fn === 'function') listeners.push(fn); };

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
