// =============================================
// BUS STAND - the Indian bus depot the journey starts from
// The bus is parked in a bay under a canopy, next to a ticket office, a
// painted destination board and a few waiting passengers. Once the player
// drives away the stand is left behind, which is exactly how a real trip
// begins: pull out of the stand, then onto the highway.
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, BUS_LENGTH, PLAYER_START_Z } from './constants.js';

const SIGN_FONT = '"Noto Sans Devanagari", "Nirmala UI", sans-serif';

/**
 * Draws the destination board that hangs over the bus bay.
 * Big Devanagari with a high-contrast palette so it reads at a glance.
 *
 * @param {Array<string>} lines - Text lines, e.g. ['बस स्टैंड', 'बौंली']
 * @returns {THREE.CanvasTexture}
 */
export function createBusStandSignTexture(lines = ['बस स्टैंड', 'बौंली']) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // Blue enamel board with a white border, like Indian bus stand signage
    ctx.fillStyle = '#124E8C';
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillRect(0, 152, 512, 8);
    ctx.fillRect(0, 0, 8, 160);
    ctx.fillRect(504, 0, 8, 160);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Fit both lines: the stand name on top, the destination underneath
    const maxWidth = 470;
    let size = 78;

    const fits = () => {
        ctx.font = `bold ${size}px ${SIGN_FONT}`;
        return lines.every(line => ctx.measureText(line).width <= maxWidth) &&
            lines.length * size * 1.15 <= 132;
    };

    while (size > 20 && !fits()) size -= 2;

    ctx.font = `bold ${size}px ${SIGN_FONT}`;
    const lineHeight = size * 1.15;
    const startY = 80 - (lineHeight * (lines.length - 1)) / 2;

    lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#FFFFFF' : '#FFD700';
        ctx.fillText(line, 256, startY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * A waiting passenger standing on the platform, with a bag beside them.
 * @param {number} variant
 * @returns {THREE.Group}
 */
function createWaitingPassenger(variant) {
    const shirts = [0xE74C3C, 0x3498DB, 0x2ECC71, 0xF39C12];
    const skins = [0xE8C5A0, 0xD4A574, 0x8D6E63];

    const person = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.6, 0.22),
        new THREE.MeshLambertMaterial({ color: shirts[variant % shirts.length], flatShading: true })
    );
    body.position.y = 0.62;
    body.castShadow = true;
    person.add(body);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshLambertMaterial({ color: skins[variant % skins.length], flatShading: true })
    );
    head.position.y = 1.03;
    head.castShadow = true;
    person.add(head);

    const legs = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.32, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x2C3E50, flatShading: true })
    );
    legs.position.y = 0.16;
    person.add(legs);

    // A bag at their feet
    const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.26, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x8B5A2B, flatShading: true })
    );
    bag.position.set(0.32, 0.13, 0.05);
    bag.castShadow = true;
    person.add(bag);

    person.userData.isWaitingPassenger = true;
    return person;
}

/**
 * Builds the bus stand next to the player's starting position.
 *
 * The stand sits on the road's left side (+X here is the oncoming half, so the
 * bay is on the negative-X side where the bus starts), with the bay opening
 * towards the carriageway so the bus can simply pull out and drive on.
 *
 * @param {Object} [options]
 * @param {number} [options.z] - Where along the road the stand is built
 * @returns {THREE.Group}
 */
export function createBusStand({ z = PLAYER_START_Z + 10 } = {}) {
    const stand = new THREE.Group();

    // --- Bay platform, set back from the shoulder on the bus's side ---
    const platformX = -(ROAD_HALF_WIDTH + SHOULDER_WIDTH + 3.2);
    const platformLength = BUS_LENGTH + 22;

    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(7, 0.25, platformLength),
        new THREE.MeshLambertMaterial({ color: 0xB9B9B9, flatShading: true })
    );
    platform.position.set(platformX - 1.5, 0.12, 0);
    platform.receiveShadow = true;
    stand.add(platform);

    // Yellow hazard lip along the platform edge (the classic Indian bus bay)
    const lip = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.3, platformLength),
        new THREE.MeshLambertMaterial({ color: 0xF5C400, flatShading: true })
    );
    lip.position.set(platformX + 1.9, 0.16, 0);
    stand.add(lip);

    // --- Canopy over the bay ---
    const canopyHeight = 3.6;
    const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.3, platformLength + 4),
        new THREE.MeshLambertMaterial({ color: 0x4A6FA5, flatShading: true })
    );
    canopy.position.set(platformX - 1.5, canopyHeight, 0);
    canopy.castShadow = true;
    stand.add(canopy);

    // Canopy support pillars
    [-platformLength / 2 + 1, 0, platformLength / 2 - 1].forEach(offsetZ => {
        const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, canopyHeight, 0.3),
            new THREE.MeshLambertMaterial({ color: 0xCFCFCF, flatShading: true })
        );
        pillar.position.set(platformX + 1.6, canopyHeight / 2, offsetZ);
        pillar.castShadow = true;
        stand.add(pillar);
    });

    // --- Ticket office at the back of the platform ---
    const officeHeight = 3.2;
    const office = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, officeHeight, 8),
        new THREE.MeshLambertMaterial({ color: 0xE8D9B0, flatShading: true })
    );
    office.position.set(platformX - 5.6, officeHeight / 2, 0);
    office.castShadow = true;
    office.receiveShadow = true;
    stand.add(office);

    const officeRoof = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.3, 8.6),
        new THREE.MeshLambertMaterial({ color: 0x8B2500, flatShading: true })
    );
    officeRoof.position.set(platformX - 5.6, officeHeight + 0.15, 0);
    stand.add(officeRoof);

    // Ticket window facing the platform
    const window = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 1.0),
        new THREE.MeshLambertMaterial({ color: 0x22303A })
    );
    window.position.set(platformX - 3.79, 1.7, 1.6);
    window.rotation.y = Math.PI / 2;
    stand.add(window);

    // --- Destination board above the canopy, facing the road ---
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 2.0),
        new THREE.MeshBasicMaterial({
            map: createBusStandSignTexture(['बस स्टैंड', 'बौंली'])
        })
    );
    sign.position.set(platformX + 3.1, canopyHeight + 1.3, 0);
    sign.rotation.y = Math.PI / 2;
    stand.add(sign);

    const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 2.0),
        new THREE.MeshLambertMaterial({ color: 0x143B5C })
    );
    signBack.position.set(platformX + 3.05, canopyHeight + 1.3, 0);
    signBack.rotation.y = -Math.PI / 2;
    stand.add(signBack);

    // --- Waiting passengers along the platform ---
    const passengers = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
        const passenger = createWaitingPassenger(i);
        passenger.position.set(
            platformX + 1.2,
            0.25,
            -platformLength / 2 + 4 + i * ((platformLength - 8) / count)
        );
        // Everyone watches the road, waiting for their bus
        passenger.rotation.y = -Math.PI / 2;
        stand.add(passenger);
        passengers.push(passenger);
    }

    // --- A bench for the people who got here early ---
    const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.45, 3.2),
        new THREE.MeshLambertMaterial({ color: 0x8B5A2B, flatShading: true })
    );
    bench.position.set(platformX - 2.2, 0.47, -platformLength / 2 + 5);
    bench.castShadow = true;
    stand.add(bench);

    stand.position.z = z;

    stand.userData.isBusStand = true;
    stand.userData.passengers = passengers;
    stand.userData.signLines = ['बस स्टैंड', 'बौंली'];
    stand.userData.platformX = platformX;

    return stand;
}

/**
 * Names shown on the bus stand board.
 * @returns {Array<string>}
 */
export function busStandSignLines() {
    return ['बस स्टैंड', 'बौंली'];
}
