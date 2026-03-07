import { BLOCK_SHAKE_DURATION, CHUNK_HEIGHT, CLUSTER_MIN_SIZE, WORLD_WIDTH } from "../constants";
import { createSurfaceDirtBlock, createSurfaceGrassBlock } from "../entities/Block";
import type {
  Block,
  BlockColor,
  FallingGroup,
  FallingMember,
  StaticBlockSnapshot
} from "../types";
import { ChunkGenerator } from "./ChunkGen";

interface ColorComponentCell {
  x: number;
  y: number;
  block: Block;
}

export interface ClusterClearOptions {
  source: "MINING" | "SKILL";
  minY?: number;
  maxY?: number;
}

export interface ClusterClearResult {
  removedBasic: number;
  damagedSturdy: number;
  removedSturdy: number;
  totalAffected: number;
}

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

    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      this.setBlock(x, 1, createSurfaceGrassBlock());
      this.setBlock(x, 2, createSurfaceDirtBlock());
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

  getNeighbors4(x: number, y: number): Array<{ x: number; y: number }> {
    return [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 }
    ];
  }

  collectSameColorComponent(
    startX: number,
    startY: number,
    color: BlockColor,
    minY: number,
    maxY: number
  ): ColorComponentCell[] {
    const component = new Map<string, ColorComponentCell>();
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (!this.isInsideX(current.x) || current.y < minY || current.y > maxY) {
        continue;
      }

      const currentKey = this.key(current.x, current.y);
      if (visited.has(currentKey)) {
        continue;
      }
      visited.add(currentKey);

      const block = this.getBlock(current.x, current.y);
      const isOrigin = current.x === startX && current.y === startY;
      const isColorBlock =
        !!block &&
        (block.type === "BASIC" || block.type === "STURDY") &&
        block.color === color;

      if (isColorBlock) {
        component.set(currentKey, { x: current.x, y: current.y, block });
      }

      if (!isOrigin && !isColorBlock) {
        continue;
      }

      for (const next of this.getNeighbors4(current.x, current.y)) {
        if (!this.isInsideX(next.x) || next.y < minY || next.y > maxY) {
          continue;
        }
        const nextKey = this.key(next.x, next.y);
        if (!visited.has(nextKey)) {
          queue.push(next);
        }
      }
    }

    return Array.from(component.values());
  }

  applyClusterEffect(component: ColorComponentCell[]): ClusterClearResult {
    let removedBasic = 0;
    let damagedSturdy = 0;
    let removedSturdy = 0;

    for (const cell of component) {
      const block = this.getBlock(cell.x, cell.y);
      if (!block) {
        continue;
      }

      if (block.type === "BASIC") {
        this.excavateBlock(cell.x, cell.y);
        removedBasic += 1;
        continue;
      }

      if (block.type === "STURDY") {
        damagedSturdy += 1;
        const nextHp = (block.hp ?? 2) - 1;
        block.hp = Math.max(0, nextHp);
        if (block.hp <= 0) {
          this.excavateBlock(cell.x, cell.y);
          removedSturdy += 1;
        }
      }
    }

    return {
      removedBasic,
      damagedSturdy,
      removedSturdy,
      totalAffected: removedBasic + damagedSturdy
    };
  }

  tryClusterClearFrom(
    x: number,
    y: number,
    color: BlockColor,
    options: ClusterClearOptions
  ): ClusterClearResult {
    const minY = options.minY ?? y - 80;
    const maxY = options.maxY ?? y + 140;

    const component = this.collectSameColorComponent(x, y, color, minY, maxY);
    const startBlock = this.getBlock(x, y);
    const startCountsAsComponent =
      !startBlock ||
      (startBlock.type !== "BASIC" && startBlock.type !== "STURDY") ||
      startBlock.color !== color;
    const effectiveSize = component.length + (startCountsAsComponent ? 1 : 0);

    if (effectiveSize < CLUSTER_MIN_SIZE) {
      return {
        removedBasic: 0,
        damagedSturdy: 0,
        removedSturdy: 0,
        totalAffected: 0
      };
    }

    return this.applyClusterEffect(component);
  }

  updateInstabilityGroups(dt: number, minY: number, maxY: number): void {
    this.updateExistingShakingGroups(dt);

    for (const [key, block] of this.staticBlocks.entries()) {
      const [x, y] = this.parseKey(key);
      if (y < minY || y > maxY) {
        continue;
      }
      if (block.type === "UNBREAKABLE") {
        if (block.fallState !== "STATIC") {
          block.fallState = "STATIC";
          block.shakeTimer = 0;
          this.cellToGroupId.delete(key);
        }
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

      let group: FallingGroup | null = null;
      if (this.isColorClusterCandidate(block)) {
        group = this.createColorClusterGroupFromSeed(x, y);
      } else {
        group = this.createVerticalGroupFromSeed(x, y);
      }
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
      if (this.groupContainsUnbreakableMember(group)) {
        this.releaseShakingGroup(group);
        continue;
      }

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
    const memberCells = new Set<string>();
    for (const member of group.members) {
      memberCells.add(this.key(member.x, group.yBase + member.yOffset));
    }

    for (const member of group.members) {
      const y = group.yBase + member.yOffset;
      const belowMemberKey = this.key(member.x, y + 1);
      if (memberCells.has(belowMemberKey)) {
        continue;
      }

      if (!this.hasExcavatedVoidBelow(member.x, y)) {
        return false;
      }
    }

    return true;
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
    const seed = this.getBlock(seedX, seedY);
    if (!seed || seed.type === "UNBREAKABLE") {
      return null;
    }

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
      if (block.type === "UNBREAKABLE") {
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
        color: item.block.color,
        visualId: item.block.visualId,
        cracked: item.block.cracked,
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

  private createColorClusterGroupFromSeed(seedX: number, seedY: number): FallingGroup | null {
    const seedKey = this.key(seedX, seedY);
    if (this.cellToGroupId.has(seedKey)) {
      return null;
    }

    const seedBlock = this.getBlock(seedX, seedY);
    if (!seedBlock || seedBlock.fallState !== "STATIC" || !this.isColorClusterCandidate(seedBlock)) {
      return null;
    }
    const seedColor = seedBlock.color;
    if (!seedColor) {
      return null;
    }

    const queue: Array<{ x: number; y: number }> = [{ x: seedX, y: seedY }];
    const visited = new Set<string>();
    const collected: Array<{ x: number; y: number; block: Block }> = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (!this.isInsideX(current.x)) {
        continue;
      }

      const currentKey = this.key(current.x, current.y);
      if (visited.has(currentKey)) {
        continue;
      }
      visited.add(currentKey);

      if (this.cellToGroupId.has(currentKey)) {
        continue;
      }

      const block = this.getBlock(current.x, current.y);
      if (!block || block.fallState !== "STATIC" || !this.isColorClusterCandidate(block)) {
        continue;
      }
      if (block.color !== seedColor) {
        continue;
      }

      collected.push({ x: current.x, y: current.y, block });

      queue.push({ x: current.x - 1, y: current.y });
      queue.push({ x: current.x + 1, y: current.y });
      queue.push({ x: current.x, y: current.y - 1 });
      queue.push({ x: current.x, y: current.y + 1 });
    }

    if (collected.length === 0) {
      return null;
    }

    const memberCells = new Set<string>();
    for (const cell of collected) {
      memberCells.add(this.key(cell.x, cell.y));
    }

    // Option A: if any bottom boundary cell is externally supported, the whole cluster stays static.
    for (const cell of collected) {
      const belowKey = this.key(cell.x, cell.y + 1);
      if (memberCells.has(belowKey)) {
        continue;
      }
      if (!this.hasExcavatedVoidBelow(cell.x, cell.y)) {
        return null;
      }
    }

    const yBase = collected.reduce((minY, item) => Math.min(minY, item.y), collected[0].y);
    const groupId = this.nextGroupId++;

    const members = collected.map((item) => {
      item.block.fallState = "SHAKING";
      item.block.shakeTimer = 0;
      this.cellToGroupId.set(this.key(item.x, item.y), groupId);

      return {
        x: item.x,
        yOffset: item.y - yBase,
        type: item.block.type,
        hp: item.block.hp,
        color: item.block.color,
        visualId: item.block.visualId,
        cracked: item.block.cracked,
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

  private isColorClusterCandidate(block: Block): boolean {
    return (block.type === "BASIC" || block.type === "STURDY") && !!block.color;
  }

  private groupContainsUnbreakableMember(group: FallingGroup): boolean {
    for (const member of group.members) {
      if (member.type === "UNBREAKABLE") {
        return true;
      }

      const y = group.yBase + member.yOffset;
      const block = this.getBlock(member.x, y);
      if (!block) {
        continue;
      }
      if (block.type === "UNBREAKABLE") {
        return true;
      }
    }
    return false;
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
