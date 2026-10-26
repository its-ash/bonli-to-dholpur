// =============================================
// UTILITY FUNCTIONS
// =============================================

import * as THREE from 'three';
import {
    COLORS, ROAD_WIDTH, ROAD_HALF_WIDTH, SHOULDER_WIDTH, LANE_DIVIDER, CENTER_LINE_OFFSET
} from './constants.js';

/**
 * Creates a vertical gradient sky texture
 * @returns {THREE.CanvasTexture}
 */
export function createSkyTexture() {
    // Only a handful of vertical bands + blocky dithering = pixel-art sky
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const bands = [
        '#3E6D9E', // horizon haze
        '#4A90D9',
        '#3C7EC4',
        '#3168AF',
        '#28589A',
        '#1E3A5F'
    ];
    const bandHeight = Math.ceil(128 / bands.length);
    bands.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, i * bandHeight, 32, bandHeight);
    });

    // Blocky dither rows between the bands to hide the seam harshly (retro look)
    for (let i = 1; i < bands.length; i++) {
        const y = i * bandHeight;
        ctx.fillStyle = bands[i];
        for (let x = 0; x < 32; x += 4) {
            ctx.fillRect(x + ((i % 2) * 2), y - 2, 2, 2);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a blocky pixel-art texture used for asphalt / grass ground
 * @param {Array<string>} palette - Colors to scatter
 * @param {number} size - Texture width/height in texels
 * @returns {THREE.CanvasTexture}
 */
export function createPixelNoiseTexture(palette, size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size, size);

    // Scatter 2x2 blocks so the pattern stays blocky even when tiled
    for (let i = 0; i < size * 3; i++) {
        const color = palette[1 + Math.floor(Math.random() * (palette.length - 1))];
        const x = Math.floor(Math.random() * (size / 2)) * 2;
        const y = Math.floor(Math.random() * (size / 2)) * 2;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a pixel-art bus body texture with blocky stripe bands
 * @returns {THREE.CanvasTexture}
 */
export function createBusBodyTexture() {
    // Deliberately tiny canvas: every texel is a big chunky pixel on the bus
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Base color - Indian bus red/orange
    ctx.fillStyle = COLORS.BUS_BASE;
    ctx.fillRect(0, 0, 64, 32);

    // Blocky stripe bands (pixel art style)
    const bandHeight = 4;
    const numBands = Math.floor(32 / bandHeight);

    for (let i = 0; i < numBands; i++) {
        const y = i * bandHeight;
        const color = COLORS.BUS_STRIPES[i % COLORS.BUS_STRIPES.length];
        ctx.fillStyle = color;
        // Staggered blocks (hard edges, no anti-aliasing)
        for (let x = 0; x < 64; x += 8) {
            const blockWidth = (i % 2 === 0) ? 4 : 8;
            ctx.fillRect(x, y, blockWidth, bandHeight);
        }
    }

    // Window band along the top of the body
    ctx.fillStyle = '#12121F';
    ctx.fillRect(0, 4, 64, 8);

    // Blocky window panes with a lighter reflection pixel
    for (let x = 2; x < 62; x += 8) {
        ctx.fillStyle = '#2A3A4E';
        ctx.fillRect(x, 5, 6, 6);
        ctx.fillStyle = '#3E5670';
        ctx.fillRect(x + 1, 6, 2, 2);
    }

    // Pixel door lines (vertical)
    ctx.fillStyle = '#8E2A1F';
    ctx.fillRect(16, 4, 1, 28);
    ctx.fillRect(48, 4, 1, 28);

    // Headlight indicators (top of texture = front of the bus)
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(4, 2, 3, 2);
    ctx.fillRect(57, 2, 3, 2);

    // Taillight indicators (bottom of texture = rear of the bus)
    ctx.fillStyle = '#FF3333';
    ctx.fillRect(4, 29, 4, 2);
    ctx.fillRect(56, 29, 4, 2);

    // Rust/dirt pixel noise for character
    ctx.fillStyle = '#8B2500';
    for (let i = 0; i < 24; i++) {
        const x = Math.floor(Math.random() * 64);
        const y = Math.floor(Math.random() * 32);
        ctx.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a pixel-art car texture
 * @param {string} baseColor - Hex color string for car body
 * @returns {THREE.CanvasTexture}
 */
export function createCarTexture(baseColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');

    // Base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 32, 16);

    // Pixel-art stripe/detail
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 4, 32, 2);

    // Window area (darker)
    ctx.fillStyle = '#12121F';
    ctx.fillRect(4, 0, 24, 4);

    // Chunkier window panes
    ctx.fillStyle = '#2A3A4E';
    ctx.fillRect(5, 1, 6, 3);
    ctx.fillRect(15, 1, 6, 3);
    ctx.fillStyle = '#3E5670';
    ctx.fillRect(6, 1, 2, 1);
    ctx.fillRect(16, 1, 2, 1);

    // Pixel door line
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(11, 4, 1, 10);

    // Headlights (top of texture = front of car)
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(3, 1, 2, 2);
    ctx.fillRect(27, 1, 2, 2);

    // Taillights (bottom of texture = rear of car)
    ctx.fillStyle = '#FF3333';
    ctx.fillRect(3, 14, 2, 2);
    ctx.fillRect(27, 14, 2, 2);

    // Pixel noise
    ctx.fillStyle = '#333333';
    for (let i = 0; i < 10; i++) {
        const x = Math.floor(Math.random() * 32);
        const y = Math.floor(Math.random() * 16);
        ctx.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a pixel-art heart decal with text arranged inside it.
 * The heart is rasterised texel by texel from its implicit equation, so it
 * stays blocky, and the text is clipped to the filled heart via
 * 'source-atop' so no letter can escape the shape.
 *
 * @param {Object} [options]
 * @param {Array<string>} [options.lines] - Text lines, widest first
 * @param {number} [options.size] - Canvas width/height in texels
 * @param {string} [options.heartColor] - Heart fill
 * @param {string} [options.heartHighlight] - Lighter shading pixels
 * @param {string} [options.textColor] - Text fill
 * @returns {THREE.CanvasTexture}
 */
export function createHeartTextTexture({
    lines = ['कुकू संग', 'चुनमुन'],
    size = 128,
    heartColor = '#D6244B',
    heartHighlight = '#F2557A',
    textColor = '#FFFFFF'
} = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    // --- Rasterise the heart, one texel at a time (pixel art) ---
    // Implicit heart curve: (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0
    const inside = new Uint8Array(size * size);
    const scaleX = 1.32;
    const scaleY = 1.32;

    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const x = ((px + 0.5) / size * 2 - 1) * scaleX;
            // Canvas Y grows downwards, the heart equation expects +Y up
            const y = (1 - (py + 0.5) / size * 2) * scaleY + 0.12;

            const a = x * x + y * y - 1;
            if (a * a * a - x * x * y * y * y <= 0) {
                inside[py * size + px] = 1;
            }
        }
    }

    // Fill + blocky edge shading
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            if (!inside[py * size + px]) continue;

            const edge =
                px === 0 || px === size - 1 || py === 0 || py === size - 1 ||
                !inside[py * size + px - 1] || !inside[py * size + px + 1] ||
                !inside[(py - 1) * size + px] || !inside[(py + 1) * size + px];

            // Light comes from the top-left, like the rest of the scene
            const highlight =
                !edge &&
                (inside[(py - 3) * size + px - 3] === 0 || inside[(py - 4) * size + px - 4] === 0);

            ctx.fillStyle = edge ? '#7E0F2A' : highlight ? heartHighlight : heartColor;
            ctx.fillRect(px, py, 1, 1);
        }
    }

    // --- Fit the text into the heart ---
    // The heart is widest near the top, so the text block is centred slightly
    // above the middle and constrained to the inner area.
    const boxCy = size * 0.44;
    const maxWidth = size * 0.60;
    const maxHeight = size * 0.42;
    const fontFamily = '"Noto Sans Devanagari", "Kohinoor Devanagari", "Nirmala UI", sans-serif';

    const measure = (fontSize) => {
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        const widths = lines.map(line => ctx.measureText(line).width);
        return {
            widths,
            widest: Math.max(...widths),
            totalHeight: fontSize * 1.25 * lines.length
        };
    };

    let fontSize = Math.floor(size * 0.2);
    let metrics = measure(fontSize);
    while (fontSize > 6 && (metrics.widest > maxWidth || metrics.totalHeight > maxHeight)) {
        fontSize -= 1;
        metrics = measure(fontSize);
    }

    // Clip to the heart: 'source-atop' keeps only pixels already painted
    ctx.globalCompositeOperation = 'source-atop';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px ${fontFamily}`;

    const lineHeight = fontSize * 1.25;
    const startY = boxCy - (lineHeight * (lines.length - 1)) / 2;

    lines.forEach((line, i) => {
        const y = startY + i * lineHeight;

        // Cheap 1-texel dark outline so white text survives the red fill
        ctx.fillStyle = '#4A0A18';
        [-1, 1].forEach(dx => {
            [-1, 1].forEach(dy => {
                ctx.fillText(line, size / 2 + dx, y + dy);
            });
        });

        ctx.fillStyle = textColor;
        ctx.fillText(line, size / 2, y);
    });

    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Bakes one length of road into a single texture: dithered asphalt, both dirt
 * shoulders, the dashed lane dividers and the double yellow centre line.
 *
 * Baking the markings into the texture (instead of hundreds of small boxes)
 * is what makes an endless road affordable: one plane per segment, and the
 * dashes still line up across the seams because the canvas height is an exact
 * multiple of the dash and centre-line periods.
 *
 * The road is four lanes wide: two lanes each way, split by the double yellow
 * centre line at x = 0 and divided inside each direction by a dashed white
 * line at x = ±LANE_DIVIDER.
 *
 * @param {Object} [options]
 * @param {number} [options.width] - Road width in world units
 * @param {number} [options.shoulderWidth] - Dirt strip on each side
 * @param {number} [options.texelsPerUnit] - Vertical resolution
 * @returns {THREE.CanvasTexture}
 */
export function createRoadSegmentTexture({
    width = ROAD_WIDTH,
    shoulderWidth = SHOULDER_WIDTH,
    texelsPerUnit = 3.2
} = {}) {
    const totalWidth = width + shoulderWidth * 2;
    const canvasWidth = Math.round(totalWidth * texelsPerUnit);
    // 192 texels tall: divisible by the 32-texel dash period and the 8-texel
    // centre-line period, so recycled segments join without a visible seam.
    const canvasHeight = 192;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const xOf = (worldX) => Math.round((worldX + totalWidth / 2) * texelsPerUnit);

    // --- Dirt shoulders (left/right edges of the canvas) ---
    const shoulderPixels = Math.round(shoulderWidth * texelsPerUnit);
    const shoulderPalette = ['#A08050', '#8C6E44', '#B08C58', '#7A6038'];
    ctx.fillStyle = shoulderPalette[0];
    ctx.fillRect(0, 0, shoulderPixels, canvasHeight);
    ctx.fillRect(canvasWidth - shoulderPixels, 0, shoulderPixels, canvasHeight);

    for (let i = 0; i < canvasHeight * 2; i++) {
        ctx.fillStyle = shoulderPalette[1 + Math.floor(Math.random() * 3)];
        const x = Math.floor(Math.random() * (shoulderPixels / 2)) * 2;
        const y = Math.floor(Math.random() * (canvasHeight / 2)) * 2;
        ctx.fillRect(x, y, 2, 2);
        ctx.fillRect(canvasWidth - shoulderPixels + x, y, 2, 2);
    }

    // --- Asphalt ---
    const asphaltPalette = ['#2D2D2D', '#262626', '#333333', '#1F1F1F'];
    ctx.fillStyle = asphaltPalette[0];
    ctx.fillRect(shoulderPixels, 0, canvasWidth - shoulderPixels * 2, canvasHeight);

    for (let i = 0; i < canvasHeight * 3; i++) {
        ctx.fillStyle = asphaltPalette[1 + Math.floor(Math.random() * 3)];
        const x = shoulderPixels + Math.floor(Math.random() * ((canvasWidth - shoulderPixels * 2) / 2)) * 2;
        const y = Math.floor(Math.random() * (canvasHeight / 2)) * 2;
        ctx.fillRect(x, y, 2, 2);
    }

    // --- Dashed white lane dividers at x = ±LANE_DIVIDER ---
    // Period 32 texels (dash 11 + gap 21), six dashes per segment.
    const dashPeriod = 32;
    const dashLength = 11;
    const dashWidth = Math.max(1, Math.round(0.15 * texelsPerUnit * 2));

    [-LANE_DIVIDER, LANE_DIVIDER].forEach(laneX => {
        for (let y = 0; y < canvasHeight; y += dashPeriod) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(xOf(laneX) - Math.floor(dashWidth / 2), y, dashWidth, dashLength);
        }
    });

    // --- Double yellow centre line (divides the two directions of travel) ---
    // Period 8 texels (5 on, 3 off) so the retro gaps line up across segments.
    [-CENTER_LINE_OFFSET, CENTER_LINE_OFFSET].forEach(offsetX => {
        const x = xOf(offsetX);
        for (let y = 0; y < canvasHeight; y += 8) {
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(x, y, 1, 5);
        }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Draws one roadside distance board (yellow Indian milestone sign) with a town
 * name and the number of kilometres to it.
 *
 * The layout is deliberately tiny and blocky (64x48 texels) so it reads like
 * the rest of the pixel-art world, and the font shrinks until the longest
 * Devanagari name fits.
 *
 * @param {string} name - Town name, e.g. 'सवाई माधोपुर'
 * @param {number} km - Distance in kilometres
 * @returns {THREE.CanvasTexture}
 */
export function createDistanceBoardTexture(name, km) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // --- Board: yellow with a black border, like an Indian milestone ---
    ctx.fillStyle = '#F2C200';
    ctx.fillRect(0, 0, 64, 48);

    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, 64, 3);
    ctx.fillRect(0, 45, 64, 3);
    ctx.fillRect(0, 0, 3, 48);
    ctx.fillRect(61, 0, 3, 48);

    // Arrow pointing the way, drawn with blocky texels
    ctx.fillRect(5, 22, 10, 4);
    ctx.beginPath();
    ctx.moveTo(15, 17);
    ctx.lineTo(22, 24);
    ctx.lineTo(15, 31);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // --- Town name: shrink until it fits between the arrow and the edge ---
    const nameMaxWidth = 38;
    let nameSize = 13;
    const nameWidth = () => {
        ctx.font = `bold ${nameSize}px "Noto Sans Devanagari", sans-serif`;
        return ctx.measureText(name).width;
    };
    while (nameSize > 5 && nameWidth() > nameMaxWidth) nameSize -= 1;

    ctx.fillStyle = '#1A1A1A';
    ctx.font = `bold ${nameSize}px "Noto Sans Devanagari", sans-serif`;
    ctx.fillText(name, 43, 18);

    // --- Distance in kilometres, bottom right ---
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillText(`${Math.round(km)}`, 43, 35);

    ctx.font = 'bold 6px "Courier New", monospace';
    ctx.fillText('KM', 54, 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a radial gradient texture for sun glow sprite
 * @returns {THREE.CanvasTexture}
 */
export function createSunGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0.0, 'rgba(255, 245, 224, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 220, 150, 0.5)');
    gradient.addColorStop(0.6, 'rgba(255, 180, 80, 0.2)');
    gradient.addColorStop(1.0, 'rgba(255, 140, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates a sun glow sprite
 * @returns {THREE.Sprite}
 */
export function createSunGlow() {
    const texture = createSunGlowTexture();
    const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xFFF5E0,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(100, 100, 1);
    sprite.renderOrder = -1;
    return sprite;
}