import { BLOCK_SHAKE_DURATION, CHUNK_HEIGHT, WORLD_WIDTH } from "../constants";
import { createBlock, fromFallingBlock } from "../entities/Block";
import type { Block, FallingBlock, StaticBlockSnapshot } from "../types";
import { ChunkGenerator } from "./ChunkGen";

export class World {
  readonly seed: number;
  readonly fallingBlocks: FallingBlock[] = [];

  private readonly generator: ChunkGenerator;
  private readonly staticBlocks = new Map<string, Block>();
  private readonly generatedChunks = new Set<number>();

  constructor(seed: number) {
    this.seed = seed;
    this.generator = new ChunkGenerator(seed);
  }

  initializeSpawn(spawnX: number, spawnY: number): void {
    this.ensureGeneratedThrough(spawnY + CHUNK_HEIGHT);
    this.removeBlock(spawnX, spawnY);
    this.setBlock(spawnX, spawnY + 1, createBlock("BASIC"));

    // Keep the first row stable so the game does not collapse before input.
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      this.setBlock(x, 2, createBlock("BASIC"));
    }
  }

  isInsideX(x: number): boolean {
    return x >= 0 && x < WORLD_WIDTH;
  }

  getBlock(x: number, y: number): Block | undefined {
    return this.staticBlocks.get(this.key(x, y));
  }

  setBlock(x: number, y: number, block: Block): void {
    if (!this.isInsideX(x)) {
      return;
    }
    this.staticBlocks.set(this.key(x, y), block);
  }

  removeBlock(x: number, y: number): void {
    this.staticBlocks.delete(this.key(x, y));
  }

  isStaticCellEmpty(x: number, y: number): boolean {
    if (!this.isInsideX(x)) {
      return false;
    }
    if (y < 0) {
      return true;
    }
    return !this.staticBlocks.has(this.key(x, y));
  }

  isCellEmpty(x: number, y: number): boolean {
    if (!this.isStaticCellEmpty(x, y)) {
      return false;
    }
    return this.getFallingAtCell(x, y) === undefined;
  }

  getFallingAtCell(x: number, y: number): FallingBlock | undefined {
    return this.fallingBlocks.find(
      (block) => block.x === x && Math.round(block.yFloat) === y
    );
  }

  ensureGeneratedThrough(maxY: number): void {
    if (maxY < 0) {
      return;
    }

    const maxChunk = Math.floor(maxY / CHUNK_HEIGHT);
    for (let chunkIndex = 0; chunkIndex <= maxChunk; chunkIndex += 1) {
      this.ensureChunk(chunkIndex);
    }
  }

  updateInstability(dt: number, minY: number, maxY: number): void {
    const fallingTransitions: Array<{ x: number; y: number; block: Block }> = [];

    for (const [key, block] of this.staticBlocks.entries()) {
      const [x, y] = this.parseKey(key);
      if (y < minY || y > maxY) {
        continue;
      }

      const isSupported = !this.isStaticCellEmpty(x, y + 1);
      if (block.fallState === "STATIC") {
        if (!isSupported) {
          block.fallState = "SHAKING";
          block.shakeTimer = 0;
        }
        continue;
      }

      if (block.fallState === "SHAKING") {
        if (isSupported) {
          block.fallState = "STATIC";
          block.shakeTimer = 0;
        } else {
          block.shakeTimer += dt;
          if (block.shakeTimer >= BLOCK_SHAKE_DURATION) {
            fallingTransitions.push({ x, y, block });
          }
        }
      }
    }

    for (const transition of fallingTransitions) {
      this.removeBlock(transition.x, transition.y);
      this.fallingBlocks.push({
        x: transition.x,
        yFloat: transition.y,
        type: transition.block.type,
        hp: transition.block.hp,
        eventId: transition.block.eventId,
        vy: 0
      });
    }
  }

  landFallingBlock(block: FallingBlock, y: number): void {
    const staticBlock = fromFallingBlock(block);
    this.setBlock(block.x, y, staticBlock);
  }

  replaceFallingBlocks(next: FallingBlock[]): void {
    this.fallingBlocks.length = 0;
    for (const block of next) {
      this.fallingBlocks.push(block);
    }
  }

  pruneRowsAbove(minY: number): void {
    for (const key of this.staticBlocks.keys()) {
      const [, y] = this.parseKey(key);
      if (y < minY) {
        this.staticBlocks.delete(key);
      }
    }

    const keptFalling = this.fallingBlocks.filter((block) => block.yFloat >= minY - 4);
    this.replaceFallingBlocks(keptFalling);
  }

  getStaticBlocksInRange(minY: number, maxY: number): StaticBlockSnapshot[] {
    const snapshots: StaticBlockSnapshot[] = [];
    for (const [key, block] of this.staticBlocks.entries()) {
      const [x, y] = this.parseKey(key);
      if (y >= minY && y <= maxY) {
        snapshots.push({ x, y, block });
      }
    }
    return snapshots;
  }

  private ensureChunk(chunkIndex: number): void {
    if (this.generatedChunks.has(chunkIndex)) {
      return;
    }

    const rows = this.generator.generateChunk(chunkIndex);
    for (const row of rows) {
      for (let x = 0; x < row.cells.length; x += 1) {
        const block = row.cells[x];
        if (!block) {
          continue;
        }
        const key = this.key(x, row.y);
        if (!this.staticBlocks.has(key)) {
          this.staticBlocks.set(key, block);
        }
      }
    }

    this.generatedChunks.add(chunkIndex);
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private parseKey(key: string): [number, number] {
    const [xText, yText] = key.split(",");
    return [Number(xText), Number(yText)];
  }
}
