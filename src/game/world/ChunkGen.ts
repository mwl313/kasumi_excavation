import { CHUNK_HEIGHT, WORLD_WIDTH } from "../constants";
import { createBlock } from "../entities/Block";
import type { Block } from "../types";

export interface GeneratedRow {
  y: number;
  cells: Array<Block | null>;
}

export class ChunkGenerator {
  constructor(private readonly seed: number) {}

  generateChunk(chunkIndex: number): GeneratedRow[] {
    const rows: GeneratedRow[] = [];
    const startY = chunkIndex * CHUNK_HEIGHT;
    const endY = startY + CHUNK_HEIGHT;
    for (let y = startY; y < endY; y += 1) {
      rows.push({
        y,
        cells: this.generateRow(y)
      });
    }
    return rows;
  }

  private generateRow(y: number): Array<Block | null> {
    if (y < 0) {
      return new Array<Block | null>(WORLD_WIDTH).fill(null);
    }
    if (y === 0) {
      return new Array<Block | null>(WORLD_WIDTH).fill(null);
    }

    const rng = mulberry32(hash32(this.seed, y, 0x9e3779b9));
    const row: Array<Block | null> = new Array<Block | null>(WORLD_WIDTH).fill(null);
    const guaranteedEmptyX = Math.floor(rng() * WORLD_WIDTH);

    const sturdyChance = y < 12 ? 0.12 : 0.2;
    const unbreakableChance = y < 18 ? 0.03 : 0.08;
    const eventChance = 0.02;

    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (x === guaranteedEmptyX) {
        row[x] = null;
        continue;
      }

      const roll = rng();
      if (roll < 1 - sturdyChance - unbreakableChance - eventChance) {
        row[x] = createBlock("BASIC");
      } else if (roll < 1 - unbreakableChance - eventChance) {
        row[x] = createBlock("STURDY");
      } else if (roll < 1 - eventChance) {
        row[x] = createBlock("UNBREAKABLE");
      } else {
        row[x] = createBlock("EVENT");
      }
    }

    return row;
  }
}

function hash32(seed: number, y: number, salt: number): number {
  let value = (seed ^ (y * 0x45d9f3b) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), value | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}