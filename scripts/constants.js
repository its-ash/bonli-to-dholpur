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
export const PIXEL_SCALE = 1;

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

// --- Animation tuning (actors and props) ---
export const ANIM = {
    SPRING_K: 60,            // suspension stiffness
    SPRING_DAMP: 7,          // suspension damping
    PITCH_PER_ACCEL: 0.006,  // rad of nose lift per m/s^2
    PITCH_MAX: 0.045,
    BOB_PER_ACCEL: 0.004,
    ROLL_SMOOTH: 5,          // body roll follow rate (1/s)
    DOOR_SPEED: 3.2,         // door open/close rate (1/s)
    DOOR_TRAVEL: 1.3,        // how far the sliding door moves along the body
    INDICATOR_HZ: 1.6,
    BRAKE_DECEL: 3.5,        // m/s^2 deceleration that lights the brake lamps
    PUFF_COUNT: 10,
    PUFF_LIFE: 1.1,
    CAM_FOV_BASE: 60,
    CAM_FOV_SPEED: 9,        // extra degrees of FOV at top speed
    CAM_PULLBACK: 0.12,      // extra distance fraction at top speed
    WALK_SWING: 0.7,         // leg swing amplitude (rad)
    WAVE_CHANCE: 0.15
};

// Colors
export const COLORS = {
    // Sky
    SKY_HORIZON: 0xF6EEEA,
    SKY_MID: 0xBFE4F6,
    SKY_ZENITH: 0x78C3F0,
    
    // Ground
    GROUND: 0xA9DE8E,
    
    // Road
    ASPHALT: 0x7C8798,
    SHOULDER: 0xF3DDB8,
    WHITE_LINE: 0xFFFBF2,
    YELLOW_LINE: 0xFFD66B,
    GRASS: 0xA9DE8E,
    
    // Trees (pastel lollipop crowns: mint, lime, candy pink, peach)
    TREE_FOLIAGE: [
        0x8EDDA8, 0xA9E07A, 0x7FD6B8, 0xFFA8C8, 0xFFC49B, 0xB6E88C
    ],
    TREE_TRUNK: 0xC49A74,
    
    // Bus
    BUS_BASE: '#FF8FA8',
    BUS_STRIPES: ['#FFB3C1', '#FFD98A', '#FFFFFF', '#8EC5F0'],
    BUS_CABIN: 0x9ED8F5,
    BUS_ROOF: 0xFFF1D6,
    BUS_BUMPER: 0xFFF6EA,
    BUS_WHEEL: 0x4B4F63,
    WHEEL_HUB: 0xFFE6A0,
    HEADLIGHT: 0xFFFFE0,
    TAILLIGHT: 0xFF0000,
    
    // Pixel-art texture palettes
    ASPHALT_PIXELS: ['#7C8798', '#768192', '#828D9E', '#707B8C'],
    GRASS_PIXELS: ['#A9DE8E', '#A0D886', '#B3E496', '#9AD282'],

    // Cars
    CAR_COLORS_SAME_DIR: ['#FF9AA2', '#9AD1FF', '#9BE8B5', '#FFD58A', '#C9A8F5'],
    CAR_COLORS_ONCOMING: ['#FFB38A', '#FFA8D4', '#8FE3E8', '#FFC2A0', '#D8C0A8'],
    CAR_ROOF: 0xFFF3DF,
    CAR_WHEEL: 0x4B4F63,
    
    // Lighting
    SUN_COLOR: 0xFFE9C9,
    SUN_INTENSITY: 2.2,
    HEMI_SKY: 0xCDEBFF,
    HEMI_GROUND: 0xF2D9C4,
    HEMI_INTENSITY: 1.5,
    
    // Sun position
    SUN_POSITION: { x: 100, y: 200, z: 50 },

};
export const FOG_COLOR = 0xF6EEEA;
export const FOG_NEAR = 140;
export const FOG_FAR = 700;          // far enough to see the distant mountains through the haze

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

// --- Landscape: forests, ponds, lakes and mountains (scripts/landscape.js) ---
// Every band keeps clear of the road, the dhabas and the petrol pumps
// (which reach |x| = 22). Items alternate sides and are recycled along the road.
export const LANDSCAPE = {
    FOREST: {
        COUNT: 10, X_MIN: 60, X_MAX: 130,       // patch centre, |x|
        HALF_WIDTH: 25, HALF_LENGTH: 35,        // oval patch size
        PINES: 28, BROADLEAF: 18, BUSHES: 14,
        GAP_MIN: 60, GAP_MAX: 110, BEHIND: 120
    },
    POND: {
        COUNT: 4, X_MIN: 40, X_MAX: 52,
        RADIUS_MIN: 5, RADIUS_MAX: 9,
        GAP_MIN: 160, GAP_MAX: 280, BEHIND: 80
    },
    LAKE: {
        COUNT: 3, X_MIN: 110, X_MAX: 145,
        RADIUS_MIN: 22, RADIUS_MAX: 36,
        GAP_MIN: 380, GAP_MAX: 600, BEHIND: 150
    },
    MOUNTAIN: {
        COUNT: 12, X_MIN: 260, X_MAX: 340, PEAKS: 4,
        GAP_MIN: 70, GAP_MAX: 130, BEHIND: 300
    },
    CLOUD: { COUNT: 16, RANGE: 1200, Y_MIN: 70, Y_MAX: 150, X_MAX: 420, DRIFT: 1.2 },
    ISLAND: {
        COUNT: 7, X_MIN: 70, X_MAX: 230, Y_MIN: 40, Y_MAX: 110,
        GAP_MIN: 80, GAP_MAX: 150, BEHIND: 160
    },
    SHORE_WIDTH: 2.5,       // sand/mud ring around the water
    SHORE_MARGIN: 3         // trees keep this far from any water
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
    { name: 'लालसोट', km: 62, side: -1 },
    { name: 'दौसा', km: 98, side: 1 },
    { name: 'जयपुर', km: 150, side: -1 }
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

// --- The route: Bonli -> Jaipur (Sindhi Camp bus stand) ---
// Stops are placed along the road by distance from the start. `town` stops are
// compulsory (missing one costs points); `village` stops are optional pickups.
// 1 km of route is UNITS_PER_KM world units, so the whole trip is LENGTH units:
// about 11-12 minutes at the 20 u/s cruise, plus the stops.
export const ROUTE = {
    START_NAME: 'बौंली',
    START_EN: 'Bonli',
    END_NAME: 'जयपुर',
    END_EN: 'Jaipur',
    END_STAND: 'सिंधी कैंप बस स्टैंड',
    END_STAND_EN: 'Sindhi Camp Bus Stand',
    TOTAL_KM: 150,
    UNITS_PER_KM: 90,
    LENGTH: 150 * 90,               // world units from the start stand to Jaipur
    ARRIVE_ZONE: 25,                // stop within this distance of the end to arrive
    OVERSHOOT: 45,                  // driving this far past the end also ends the trip
    MISS_MARGIN: 40,                // units past a compulsory stop before it counts as missed
    PAR_TIME: 780,                  // seconds: finishing sooner earns a time bonus
    FUEL_BURN_SCALE: 1.6,           // the trip needs about one refuel stop
    LOW_FUEL_PERCENT: 30,
    OUT_OF_FUEL_GRACE: 2.5,         // seconds stuck without fuel before the trip is over
    TOWN_WAITING: [10, 22],         // passengers waiting at a town stop (min, max)
    VILLAGE_WAITING: [3, 9],
    STOPS: [
        { id: 'bhagwatpura', kind: 'village', km: 12, name: 'भगवतपुरा', en: 'Bhagwatpura' },
        { id: 'malarna', kind: 'town', km: 26, name: 'मालारना डूंगर', en: 'Malarna Dungar' },
        { id: 'ramgarh', kind: 'village', km: 44, name: 'रामगढ़ पचवारा', en: 'Ramgarh Pachwara' },
        { id: 'lalsot', kind: 'town', km: 62, name: 'लालसोट', en: 'Lalsot' },
        { id: 'sikrai', kind: 'village', km: 80, name: 'सिकराय', en: 'Sikrai' },
        { id: 'dausa', kind: 'town', km: 98, name: 'दौसा', en: 'Dausa' },
        { id: 'chandwaji', kind: 'village', km: 122, name: 'चांदवाजी', en: 'Chandwaji' }
    ],
    SCORE: {
        TIME_BONUS_PER_SEC: 2,
        SAFETY_POINTS: 5,           // per point of safety left
        ARRIVAL_BONUS: 300,
        MISSED_STOP_PENALTY: 150,
        CRASH_PENALTY: 20,
        PEDESTRIAN_PENALTY: 80,
        GOOD_SAFETY: 70             // safety needed for a star
    },
    BEST_KEY: 'bonli-jaipur-best'
};

// --- Biomes: the zones the route passes through (scripts/biomes.js) ---
// Zones are laid out by distance along the route (same units as journey.distance
// and ROUTE.LENGTH). They are contiguous: each `start` equals the previous `end`,
// the first starts at 0 and the last ends at ROUTE.LENGTH. Fiction is fine:
// Dausa sits on a made-up sea coast.
//   farmland  0-24 km    Bonli, Bhagwatpura
//   mountain  24-56 km   Malarna Dungar, Ramgarh Pachwara
//   desert    56-90 km   Lalsot, Sikrai
//   coast     90-118 km  Dausa
//   farmland  118-150 km Chandwaji, Jaipur outskirts
// Palette colours are hex numbers; `sky` is a multiplier on the sky texture.
const biomeKm = (km) => (km / ROUTE.TOTAL_KM) * ROUTE.LENGTH;
export const BIOME_CROSSFADE = 300;   // world units over which two zones blend
export const BIOMES = [
    {
        id: 'farmland', name: 'बौंली के खेत', en: 'Bonli Farmland',
        start: 0, end: biomeKm(24),
        palette: {
            ground: 0xA9DE8E, shoulder: 0xF3DDB8,
            fog: 0xF6EEEA, fogNear: 140, fogFar: 700,
            sky: 0xFFFFFF, sun: 0xFFE9C9, sunIntensity: 2.2,
            hemiSky: 0xCDEBFF, hemiGround: 0xF2D9C4
        }
    },
    {
        id: 'mountain', name: 'अरावली पहाड़ियाँ', en: 'Aravalli Hills',
        start: biomeKm(24), end: biomeKm(56),
        palette: {
            ground: 0x9CC48A, shoulder: 0xD9CDB8,
            fog: 0xDDE7EF, fogNear: 120, fogFar: 640,
            sky: 0xE4EFFF, sun: 0xFFF1DC, sunIntensity: 2.0,
            hemiSky: 0xBFD8F0, hemiGround: 0xD8CDBE
        }
    },
    {
        id: 'desert', name: 'थार रेगिस्तान', en: 'Thar Desert',
        start: biomeKm(56), end: biomeKm(90),
        palette: {
            ground: 0xEBCB8B, shoulder: 0xF6E2B0,
            fog: 0xF8E3C0, fogNear: 160, fogFar: 760,
            sky: 0xFFE9C4, sun: 0xFFD9A0, sunIntensity: 2.4,
            hemiSky: 0xFFE2B8, hemiGround: 0xF0C890
        }
    },
    {
        id: 'coast', name: 'समुद्र तट', en: 'Sea Coast',
        start: biomeKm(90), end: biomeKm(118),
        palette: {
            ground: 0xE8DDB0, shoulder: 0xF7ECCB,
            fog: 0xE6F4F8, fogNear: 150, fogFar: 760,
            sky: 0xD6F0FF, sun: 0xFFF4E0, sunIntensity: 2.2,
            hemiSky: 0xBFE8FF, hemiGround: 0xF0E4C8
        }
    },
    {
        id: 'farmland', name: 'जयपुर के खेत', en: 'Jaipur Farmland',
        start: biomeKm(118), end: ROUTE.LENGTH,
        palette: {
            ground: 0xA9DE8E, shoulder: 0xF3DDB8,
            fog: 0xF6EEEA, fogNear: 140, fogFar: 700,
            sky: 0xFFFFFF, sun: 0xFFE9C9, sunIntensity: 2.2,
            hemiSky: 0xCDEBFF, hemiGround: 0xF2D9C4
        }
    }
];

// Mountain-pass biome tuning (scripts/biome_mountain.js; every key is optional)
export const MOUNTAIN_BIOME = {
    CHUNK_LEN: 36,          // metres of road per scenery chunk (keep a multiple of 4)
    CHUNK_COUNT: 12,        // chunks in the recycled ring
    SINK: 34,               // scenery sinks this far below ground at weight 0
    BARRIER_X: 8.45,        // centre line of the painted stone barrier
    SIGN_GAP: 95, MONKEY_GAP: 70, FOG_GAP: 55,
    WATERFALL_EVERY: 13, BRIDGE_EVERY: 17, FORT_EVERY: 15   // chunks between set pieces
};

// =============================================
// TRAFFIC_TYPES - the mix of vehicles on the road (scripts/traffic_models.js,
// scripts/vehicles.js). length/width are the collision box (units), speed is
// the cruising range in u/s, lane 'outer' = slow vehicles hug the outer lane,
// weave = sideways wobble (units) inside the lane. Cars have several body
// styles, each with its own box (see CAR_STYLES in traffic_models.js).
// =============================================
export const TRAFFIC_TYPES = {
    car:     { speed: [12, 18], oncomingSpeed: [15, 20], lane: 'any' },
    auto:    { length: 2.7, width: 1.5, speed: [9, 14],  lane: 'outer' },
    bike:    { length: 2.1, width: 0.8, speed: [12, 22], lane: 'any', weave: 0.5 },
    bicycle: { length: 1.8, width: 0.6, speed: [4, 7],   lane: 'outer', weave: 0.15 },
    truck:   { length: 8.6, width: 2.5, speed: [12, 18], lane: 'any' },
    tractor: { length: 6.8, width: 2.1, speed: [6, 9],   lane: 'outer' }
};

// Extra (non-car) vehicles per direction, on top of SAME_DIRECTION_CAR_COUNT /
// ONCOMING_CAR_COUNT cars. Kept small so phones stay smooth.
export const TRAFFIC_MIX = {
    sameDir:  { auto: 1, bike: 2, bicycle: 1, truck: 1, tractor: 1 },
    oncoming: { auto: 1, bike: 2, bicycle: 1, truck: 1 }
};

// Car paints, weighted like Indian roads: plenty of white and silver
export const TRAFFIC_CAR_PAINTS = [
    0xF4F4F0, 0xF4F4F0, 0xF4F4F0, 0xF4F4F0, 0xF4F4F0, 0xF4F4F0,   // white
    0xCBD0D8, 0xCBD0D8, 0xCBD0D8,                                 // silver
    0x8D93A0, 0x8D93A0,                                           // grey
    0xE8626E, 0xE8626E,                                           // red
    0x6FA3E6, 0x6FA3E6,                                           // blue
    0x3A3D4C, 0xD9C6A0, 0x8FD0A8                                  // black, beige, mint
];

// --- JUNCTIONS: roundabouts, crossroads and T-junctions (scripts/junctions.js) ---
// Sites sit at fixed route distances (km from the Bonli start). Each one adds a
// straight zone to the road path, so registerJunctionZones() must run BEFORE the
// endless world is built. Roundabouts are "through" roundabouts: the highway
// cuts straight across a ring road, so the bus never has to leave its lanes.
export const JUNCTIONS = {
    ZONE_HALF: 70,          // half length of the straight road around each junction
    BUILD_RANGE: 600,       // build a junction when the bus is within this many metres
    HIDE_RANGE: 700,        // hide it again beyond this
    ANIM_RANGE: 260,        // lamps / cross traffic / fountain animate within this
    RING_R: 21,             // roundabout ring road radius
    ISLAND_R: 14,           // grass island radius
    STOP_LINE: 11,          // metres before the junction centre (on the bus's side)
    SIGNAL_PERIOD: 30,      // seconds for one full signal cycle
    APPROACH: 100,          // signalStateAt reports a signal this far before its stop line
    SAFETY_RED_LIGHT: 6,    // safety points lost for running a red light
    SITES: [
        { km: 5,   kind: 'crossroads', name: 'Bonli Chauraha' },
        { km: 19,  kind: 'tee',        name: 'Bhagwatpura Tiraha' },
        { km: 24.9, kind: 'roundabout', name: 'Malarna Circle' },
        { km: 36,  kind: 'crossroads', name: 'Ramgarh Chauraha' },
        { km: 53,  kind: 'tee',        name: 'Hill Tiraha' },
        { km: 61,  kind: 'roundabout', name: 'Lalsot Circle' },
        { km: 71,  kind: 'crossroads', name: 'Sikrai Chauraha' },
        { km: 85,  kind: 'tee',        name: 'Desert Tiraha' },
        { km: 97,  kind: 'roundabout', name: 'Dausa Circle' },
        { km: 108, kind: 'tee',        name: 'Coast Tiraha' },
        { km: 130, kind: 'crossroads', name: 'Chandwaji Chauraha' },
        { km: 142, kind: 'roundabout', name: 'Jaipur Gate Circle' }
    ]
};
