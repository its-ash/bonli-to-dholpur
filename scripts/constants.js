// =============================================
// CONSTANTS AND CONFIGURATION
// =============================================

// Road dimensions
// A four-lane highway: four 3-unit lanes inside a 12-unit carriageway,
// split by a double-yellow centre line into two directions of travel.
export const ROAD_WIDTH = 12;
export const ROAD_LENGTH = 400;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const SHOULDER_WIDTH = 1.5;

// Lane positions (centres of the four 3-unit lanes)
//   -4.5 | -1.5 || +1.5 | +4.5
// The bus and same-direction traffic run in the negative-X half, oncoming
// traffic runs in the positive-X half.
export const LANE_LEFT_OUTER = -4.5;
export const LANE_LEFT = -1.5;
export const LANE_RIGHT = 1.5;
export const LANE_RIGHT_OUTER = 4.5;

// Solid/dashed line positions between the lanes
// 0    = double yellow centre line (opposing traffic)
// ±3   = dashed white dividers between the two lanes of each direction
export const LANE_DIVIDER = 3;
export const CENTER_LINE_OFFSET = 0.25;

// Lanes each direction of travel may use
export const LANES_FORWARD = [LANE_LEFT, LANE_LEFT_OUTER];
export const LANES_ONCOMING = [LANE_RIGHT, LANE_RIGHT_OUTER];

// Player spawn (near the +Z end so the whole road is ahead of the bus,
// which drives toward -Z like the same-direction traffic)
export const PLAYER_START_Z = ROAD_LENGTH / 2 - 40;

// The road never ends: scripts/endless.js builds it from recycled segments
// that are moved from behind the bus to the far horizon as the player drives.
export const SEGMENT_LENGTH = 60;         // length of one road segment (Z)
export const SEGMENT_COUNT = 16;          // segments alive at once
export const SEGMENT_RECYCLE_BEHIND = 90; // how much road stays behind the bus

// Distance from the spawn point to the far edge of the built world
export const WORLD_AHEAD = SEGMENT_LENGTH * SEGMENT_COUNT - 120;

// Pixel-art look: the scene renders at 1/PIXEL_SCALE resolution and is
// upscaled by the browser. A smaller value means a sharper, clearer image:
//   3 = very chunky, 2 = mild pixelation, 1 = full native resolution.
// 2 keeps some of the retro character without making signs and lanes hard to
// read on a phone.
export const PIXEL_SCALE = 2;

// Bus dimensions
export const BUS_LENGTH = 10;
export const BUS_WIDTH = 2.5;
export const BUS_HEIGHT = 3.2;
export const WHEEL_RADIUS = 0.55;
export const WHEEL_WIDTH = 0.4;

// Car dimensions
export const CAR_LENGTH = 4;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;
export const CAR_WHEEL_RADIUS = 0.35;
export const CAR_WHEEL_WIDTH = 0.25;

// Camera
export const CAMERA_OFFSET = { x: 0, y: 8, z: 12 };
export const CAMERA_DAMPING = 8.0;

// Phones have a narrow, tall viewport, so the camera pulls back a little to keep
// the road ahead visible. >1 moves the camera further away (zoomed out).
export const CAMERA_MOBILE_ZOOM = 1.3;
export const CAMERA_DESKTOP_ZOOM = 1.0;

// Colors
export const COLORS = {
    // Sky
    SKY_HORIZON: 0x87CEEB,
    SKY_MID: 0x4A90D9,
    SKY_ZENITH: 0x1E3A5F,
    
    // Ground
    GROUND: 0x5D7B4A,
    
    // Road
    ASPHALT: 0x2D2D2D,
    SHOULDER: 0xA08050,
    WHITE_LINE: 0xFFFFFF,
    YELLOW_LINE: 0xFFD700,
    GRASS: 0x3A6B2E,
    
    // Trees
    TREE_FOLIAGE: [
        0x2D5A27, 0x3A6B2E, 0x4A7C3A, 0x558B2F, 0x2E7D32
    ],
    TREE_TRUNK: 0x4A3728,
    
    // Bus
    BUS_BASE: '#C0392B',
    BUS_STRIPES: ['#E74C3C', '#F39C12', '#FFFFFF', '#2C3E50'],
    BUS_CABIN: 0x1A1A2E,
    BUS_ROOF: 0x8B0000,
    BUS_BUMPER: 0x333333,
    BUS_WHEEL: 0x1A1A1A,
    WHEEL_HUB: 0x9AA0A6,
    HEADLIGHT: 0xFFFFE0,
    TAILLIGHT: 0xFF0000,
    
    // Pixel-art texture palettes
    ASPHALT_PIXELS: ['#2D2D2D', '#262626', '#333333', '#1F1F1F'],
    GRASS_PIXELS: ['#3A6B2E', '#335F27', '#447C36', '#2D5525'],

    // Cars
    CAR_COLORS_SAME_DIR: ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6'],
    CAR_COLORS_ONCOMING: ['#E67E22', '#E91E63', '#00BCD4', '#FF5722', '#795548'],
    CAR_ROOF: 0x2C3E50,
    CAR_WHEEL: 0x1A1A1A,
    
    // Lighting
    SUN_COLOR: 0xFFF5E0,
    SUN_INTENSITY: 2.5,
    HEMI_SKY: 0x87CEEB,
    HEMI_GROUND: 0x4A766A,
    HEMI_INTENSITY: 1.2,
    
    // Sun position
    SUN_POSITION: { x: 100, y: 200, z: 50 },

};
export const FOG_COLOR = 0x87CEEB;
export const FOG_NEAR = 100;
export const FOG_FAR = 500;

export const SHADOW_CAMERA = { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 500 };
export const SHADOW_MAP_SIZE = 2048;

// Game physics
export const PHYSICS = {
    BUS_MAX_SPEED: 25,
    BUS_ACCELERATION: 15,
    BUS_BRAKE_FORCE: 20,
    BUS_MAX_STEER: 0.42,     // rad, front-wheel angle at full lock
    BUS_WHEELBASE: 10,       // distance between the axles (roughly the bus length)
    BUS_STEER_RATE: 1.6,     // full-lock sweeps per second: the heavy wheel turns smoothly
    BUS_ROLL: 0.035,         // rad of body lean at full lock and top speed
    BUS_DRAG: 3.0,
    
    CAR_ACCEL_RATE: 4.0,
    CAR_BRAKE_RATE: 12.0,
    CAR_MIN_SPEED: 10,
    CAR_MAX_SPEED: 22,
    CAR_STEER_SPEED: 3.0,
    CAR_MIN_GAP: 15,

    // Collision response tuning
    BUS_RESTITUTION: 0.35,   // how much speed the bus keeps after an impact
    CAR_SHOVE: 0.8,          // share of the separation the car takes in a hit
    CAR_HIT_RECOVERY: 0.8,   // seconds a car needs to recover from an impact

    RESPAWN_BUFFER: 50
};

// --- AI traffic lane changes ---
// A car stuck behind a slower vehicle switches to the other lane of its
// direction when that lane is clear around it.
export const TRAFFIC_LANE_CHANGE = {
    TRIGGER_GAP: 22,       // gap to the car ahead that makes a car look for a lane change
    CLEAR_AHEAD: 20,       // the target lane must be empty this far ahead
    CLEAR_BEHIND: 14,      // ...and this far behind
    LANE_TOLERANCE: 1.6,   // vehicles closer than this sideways count as in that lane
    LATERAL_SPEED: 2.2,    // u/s a car may drift sideways
    COOLDOWN_MIN: 5,       // seconds before a car may change lanes again
    COOLDOWN_MAX: 10
};

// Tree placement
export const TREE_COUNT_PER_SIDE = 8;
export const TREE_BASE_X_OFFSET = 2 + 8; // grass + offset
export const TREE_JITTER_Z = 15;
export const TREE_JITTER_X = 4;
export const TREE_START_Z_OFFSET = 20;
export const TREE_END_Z_OFFSET = 20;

// Grass patches
export const GRASS_PATCH_COUNT = 40;
export const GRASS_START_X_OFFSET = 1;
export const GRASS_WIDTH = 15;

// Music playlist - every entry is a path relative to index.html.
// Drop more files into song/ and add them here; tracks that fail to load
// (missing file / unsupported codec) are skipped automatically.
export const SONG_PLAYLIST = [
    'song/Mujhse Mohabbat Ka Izhaar Karta.mp3'
];

export const MUSIC_VOLUME = 0.45;

// Text shown inside the pixel-art heart on the back of the bus
// (widest line first, so the layout stays balanced)
export const HEART_TEXT_LINES = ['कुकू संग', 'चुनमुन'];

// Car counts
export const SAME_DIRECTION_CAR_COUNT = 3;
export const ONCOMING_CAR_COUNT = 2;

// --- Roadside shops (dhabas / kiosks) ---
// A row of small buildings sits just past the grass strip, on both sides.
export const SHOP_STRIP_X = GRASS_START_X_OFFSET + GRASS_WIDTH + 2;
export const SHOP_MIN_GAP = 24;
export const SHOP_MAX_GAP = 44;

// --- Roadside dhabas (restaurants) ---
// Set well back from the asphalt so the terrace and diners stay off the road.
export const DHABA_X = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 7;
export const DHABA_GAP_MIN = 130;
export const DHABA_GAP_MAX = 230;

// --- Distance boards (roadside town signs) ---
// Each board is built once and recycled like the rest of the world.
// `side` is -1 (left of the road) or +1 (right).
export const DISTANCE_BOARDS = [
    { name: 'बौंली', km: 12, side: -1 },
    { name: 'सवाई माधोपुर', km: 28, side: 1 },
    { name: 'धौलपुर', km: 46, side: -1 }
];
export const DISTANCE_BOARD_X = 9.5;

// --- Autopilot ("AUTO" button) ---
// One press hands the bus to an AI driver that accelerates, keeps the left
// lane, overtakes slower traffic, and gives up (stopping the bus) when the
// road is blocked or the end of the road is reached.
export const AUTOPILOT = {
    CRUISE_SPEED: 20,          // u/s the AI driver aims for
    LOOK_AHEAD: 34,            // how far down the road it scans for traffic
    OVERTAKE_GAP: 30,          // distance at which it starts changing lanes (room to finish the move at speed)
    HEADING_GAIN: 0.22,        // how hard it turns towards its target lane
    MAX_HEADING: 0.32,         // rad, the sharpest heading used to change lanes
    STEER_FULL: 0.9,           // rad of heading error that means full steering lock
    OVERTAKE_BOOST: 4,         // u/s faster than the car being passed
    OVERTAKE_CLEAR_AHEAD: 26,  // target lane must be empty this far ahead of the bus
    OVERTAKE_CLEAR_BEHIND: 12, // ...and this far behind it
    EMERGENCY_GAP: 8,          // gap that triggers hard braking
    EMERGENCY_DECEL: 30,       // braking when something is right in front
    STOPPED_TIME_LIMIT: 5.0,   // seconds of <0.6 u/s before autopilot stops
    STOPPED_SPEED: 0.6
};

// --- Bus simulation (fuel, stops, passengers, fares, safety, horn) ---
export const BUS_SIM = {
    FUEL_CAPACITY: 60,         // litres
    FUEL_IDLE_RATE: 0.02,      // L/s with the engine running
    FUEL_DRIVE_RATE: 0.05,     // extra L/s at top speed
    REFUEL_RATE: 6,            // L/s taken on at a petrol pump
    PUMP_ZONE: 14,             // metres either side of a pump that count as the forecourt
    PASSENGER_CAPACITY: 40,
    FARE: 12,                  // rupees per boarding passenger, scaled by safety
    STOP_X: -7.6,              // kerb-side shelters sit on the left of the road
    STOP_KERB_X: 4.5,          // the bus must be within this x distance of the shelter
    STOP_ZONE: 8,              // metres either side of a shelter that count as the stop
    STOP_DWELL: 4,             // seconds the doors stay open
    STOP_SPACING_MIN: 260,
    STOP_SPACING_MAX: 420,
    STOP_COUNT: 4,
    STOP_WAITING_MAX: 6,       // most passengers waiting at one shelter
    SAFETY_MAX: 100,
    SAFETY_CAR_HIT: 4,
    SAFETY_PEDESTRIAN_HIT: 12,
    HORN_FREQUENCY: 420        // Hz
};
