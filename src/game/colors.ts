import type { BlockColor } from "./types";

export const BLOCK_COLORS: BlockColor[] = ["RED", "BLUE", "GREEN", "YELLOW"];

export function pickRandomBlockColor(rng: () => number = Math.random): BlockColor {
  const index = Math.floor(rng() * BLOCK_COLORS.length);
  return BLOCK_COLORS[index] ?? "RED";
}

