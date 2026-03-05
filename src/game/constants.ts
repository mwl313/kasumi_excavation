export const WORLD_WIDTH = 7;
export const TILE_SIZE = 56;
export const CANVAS_WIDTH = WORLD_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = 840;

export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.25;

export const PLAYER_MAX_HP = 3;
export const PLAYER_IFRAME_DURATION = 0.2;
export const PLAYER_ACTION_INTERVAL = 0.09;
export const PLAYER_MOVE_SPEED = 10;
export const PLAYER_GRAVITY = 30;
export const PLAYER_MAX_VY = 12.5;

export const BLOCK_SHAKE_DURATION = 0.2;
export const BLOCK_GRAVITY = 30;
export const BLOCK_MAX_VY = 12.5;

export const CHUNK_HEIGHT = 24;
export const GENERATE_AHEAD_ROWS = 120;
export const ACTIVE_CHECK_UP_ROWS = 50;
export const ACTIVE_CHECK_DOWN_ROWS = 90;
export const PRUNE_ROWS_ABOVE = 100;
export const CLUSTER_MIN_SIZE = 4;
export const CLUSTER_SCAN_UP = 80;
export const CLUSTER_SCAN_DOWN = 140;
export const NATURAL_EMPTY_CHANCE = 0.01;
export const NATURAL_EMPTY_START_DEPTH = 10;
export const GEN_NEIGHBOR_BONUS_LEFT = 3;
export const GEN_NEIGHBOR_BONUS_UP = 3;
export const GEN_NEIGHBOR_BONUS_MATCH = 2;
export const GEN_DENSITY_WINDOW = 3;
export const GEN_DENSITY_PENALTY_START = 5;
export const GEN_DENSITY_PENALTY = 2;
export const GEN_DENSITY_HARD_BLOCK = 7;
export const GEN_MAX_COMPONENT = 12;
export const GEN_MAX_COMPONENT_RECOLOR_LIMIT = 12;
export const GEN_COMBO_MIN_RATIO = 0.25;
export const GEN_COMBO_MAX_RATIO = 0.4;
export const GEN_COMBO_FIX_PASSES = 6;
export const GEN_STAMP_TRIES = 10;
export const GEN_STAMP_COUNT_PER_PASS = 2;
export const RESONANCE_MAX = 25;
export const RESONANCE_COST = 25;
export const ANCHOR_DURATION = 3.0;

export const CAMERA_OFFSET_ROWS = 6;
export const CAMERA_SMOOTH_SPEED = 10;
export const BEST_DEPTH_STORAGE_KEY = "kasumi_excavation.bestDepth";
