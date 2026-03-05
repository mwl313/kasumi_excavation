import { BLOCK_SHAKE_DURATION, CHUNK_HEIGHT, WORLD_WIDTH } from "../constants";
import { createBlock } from "../entities/Block";
import type { Block, FallingGroup, FallingMember, StaticBlockSnapshot } from "../types";
import { ChunkGenerator } from "./ChunkGen";

export class World {
  readonly seed: number;
  readonly fallingGroups: FallingGroup[] = [];

  private readonly generator: ChunkGenerator;
  private readonly staticBlocks = new Map<string, Block>();
  private readonly generatedChunks = new Set<number>();
  private readonly excavatedVoids = new Set<string>();
  private readonly cellToGroupId = new Map<string, number>();
  private nextGroupId = 1;

  constructor(seed: number) {
    this.seed = seed;
    this.generator = new ChunkGenerator(seed);
  }

  initializeSpawn(spawnX: number, spawnY: number): void {
    this.ensureGeneratedThrough(spawnY + CHUNK_HEIGHT);
    this.removeBlock(spawnX, spawnY);
    this.setBlock(spawnX, spawnY + 1, createBlock("BASIC"));

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
    this.clearExcavatedVoid(x, y);
  }

  removeBlock(x: number, y: number): void {
    this.staticBlocks.delete(this.key(x, y));
  }

  excavateBlock(x: number, y: number): void {
    this.removeBlock(x, y);
    this.markExcavatedVoid(x, y);
  }

  markExcavatedVoid(x: number, y: number): void {
    if (!this.isInsideX(x)) {
      return;
    }
    this.excavatedVoids.add(this.key(x, y));
  }

  clearExcavatedVoid(x: number, y: number): void {
    this.excavatedVoids.delete(this.key(x, y));
  }

  isExcavatedVoid(x: number, y: number): boolean {
    return this.excavatedVoids.has(this.key(x, y));
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
    return !this.hasFallingGroupAtCell(x, y);
  }

  hasFallingGroupAtCell(x: number, y: number): boolean {
    for (const group of this.fallingGroups) {
      if (group.state !== "FALLING") {
        continue;
      }
      for (const member of group.members) {
        if (member.x === x && this.getFallingMemberCellY(group, member) === y) {
          return true;
        }
      }
    }
    return false;
  }

  getSupportingFallingGroupUnderPlayer(
    playerX: number,
    playerY: number
  ): { groupId: number; surfaceY: number } | null {
    const targetY = playerY + 1;
    for (const group of this.fallingGroups) {
      if (group.state !== "FALLING") {
        continue;
      }
      for (const member of group.members) {
        if (member.x === playerX && this.getFallingMemberCellY(group, member) === targetY) {
          return { groupId: group.id, surfaceY: targetY };
        }
      }
    }
    return null;
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

  updateInstabilityGroups(dt: number, minY: number, maxY: number): void {
    this.updateExistingShakingGroups(dt);

    for (const [key, block] of this.staticBlocks.entries()) {
      const [x, y] = this.parseKey(key);
      if (y < minY || y > maxY) {
        continue;
      }
      if (block.fallState !== "STATIC") {
        continue;
      }
      if (this.cellToGroupId.has(key)) {
        continue;
      }
      if (!this.hasExcavatedVoidBelow(x, y)) {
        continue;
      }

      const group = this.createVerticalGroupFromSeed(x, y);
      if (!group) {
        continue;
      }
      this.fallingGroups.push(group);
    }
  }

  getFallingMemberCellY(group: FallingGroup, member: FallingMember): number {
    return Math.round(group.yFloat + member.yOffset);
  }

  pruneRowsAbove(minY: number): void {
    for (const key of this.staticBlocks.keys()) {
      const [, y] = this.parseKey(key);
      if (y < minY) {
        this.staticBlocks.delete(key);
        this.cellToGroupId.delete(key);
      }
    }

    for (const key of Array.from(this.excavatedVoids)) {
      const [, y] = this.parseKey(key);
      if (y < minY) {
        this.excavatedVoids.delete(key);
      }
    }

    const keptGroups = this.fallingGroups.filter((group) => {
      const maxOffset = group.members.reduce((acc, member) => Math.max(acc, member.yOffset), 0);
      return group.yFloat + maxOffset >= minY - 4;
    });
    for (const group of this.fallingGroups) {
      if (keptGroups.includes(group)) {
        continue;
      }
      if (group.state === "SHAKING") {
        for (const member of group.members) {
          this.cellToGroupId.delete(this.key(member.x, group.yBase + member.yOffset));
        }
      }
    }
    this.replaceFallingGroups(keptGroups);
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

  replaceFallingGroups(next: FallingGroup[]): void {
    this.fallingGroups.length = 0;
    for (const group of next) {
      this.fallingGroups.push(group);
    }
  }

  private updateExistingShakingGroups(dt: number): void {
    const nextGroups: FallingGroup[] = [];

    for (const group of this.fallingGroups) {
      if (group.state !== "SHAKING") {
        nextGroups.push(group);
        continue;
      }

      if (!this.groupStillUnstable(group)) {
        this.releaseShakingGroup(group);
        continue;
      }

      group.shakeTimer += dt;
      if (group.shakeTimer >= BLOCK_SHAKE_DURATION) {
        this.convertShakingGroupToFalling(group);
      }
      nextGroups.push(group);
    }

    this.replaceFallingGroups(nextGroups);
  }

  private groupStillUnstable(group: FallingGroup): boolean {
    for (const member of group.members) {
      const y = group.yBase + member.yOffset;
      if (this.hasExcavatedVoidBelow(member.x, y)) {
        return true;
      }
    }
    return false;
  }

  private releaseShakingGroup(group: FallingGroup): void {
    for (const member of group.members) {
      const y = group.yBase + member.yOffset;
      const block = this.getBlock(member.x, y);
      if (block) {
        block.fallState = "STATIC";
        block.shakeTimer = 0;
      }
      this.cellToGroupId.delete(this.key(member.x, y));
    }
  }

  private convertShakingGroupToFalling(group: FallingGroup): void {
    for (const member of group.members) {
      const y = group.yBase + member.yOffset;
      this.removeBlock(member.x, y);
      this.cellToGroupId.delete(this.key(member.x, y));
    }

    group.state = "FALLING";
    group.vy = 0;
    group.yFloat = group.yBase;
  }

  private createVerticalGroupFromSeed(seedX: number, seedY: number): FallingGroup | null {
    const collected: Array<{ x: number; y: number; block: Block }> = [];

    let y = seedY;
    while (true) {
      const key = this.key(seedX, y);
      if (this.cellToGroupId.has(key)) {
        break;
      }

      const block = this.staticBlocks.get(key);
      if (!block || block.fallState !== "STATIC") {
        break;
      }

      collected.push({ x: seedX, y, block });
      y -= 1;
    }

    if (collected.length === 0) {
      return null;
    }

    const yBase = collected.reduce((minY, item) => Math.min(minY, item.y), collected[0].y);
    const groupId = this.nextGroupId++;

    const members = collected.map((item) => {
      item.block.fallState = "SHAKING";
      item.block.shakeTimer = 0;
      const key = this.key(item.x, item.y);
      this.cellToGroupId.set(key, groupId);

      return {
        x: item.x,
        yOffset: item.y - yBase,
        type: item.block.type,
        hp: item.block.hp,
        eventId: item.block.eventId
      };
    });

    return {
      id: groupId,
      state: "SHAKING",
      shakeTimer: 0,
      yBase,
      yFloat: yBase,
      vy: 0,
      members
    };
  }

  private hasExcavatedVoidBelow(x: number, y: number): boolean {
    const belowY = y + 1;
    return this.isStaticCellEmpty(x, belowY) && this.isExcavatedVoid(x, belowY);
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
          this.clearExcavatedVoid(x, row.y);
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
