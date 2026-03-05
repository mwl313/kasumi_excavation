export const WORLD_WIDTH = 7;
export const TILE_SIZE = 56;
export const CANVAS_WIDTH = WORLD_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = 840;

export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.25;

export const PLAYER_MAX_HP = 3;
export const PLAYER_FALL_INTERVAL = 0.08;
export const PLAYER_IFRAME_DURATION = 0.2;
export const PLAYER_ACTION_INTERVAL = 0.09;

export const BLOCK_SHAKE_DURATION = 0.1;
export const BLOCK_GRAVITY = 60;
export const BLOCK_MAX_VY = 25;

export const CHUNK_HEIGHT = 24;
export const GENERATE_AHEAD_ROWS = 120;
export const ACTIVE_CHECK_UP_ROWS = 50;
export const ACTIVE_CHECK_DOWN_ROWS = 90;
export const PRUNE_ROWS_ABOVE = 100;

export const CAMERA_OFFSET_ROWS = 6;
export const BEST_DEPTH_STORAGE_KEY = "kasumi_excavation.bestDepth";