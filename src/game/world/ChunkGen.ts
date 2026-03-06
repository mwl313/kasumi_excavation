import {
  CHUNK_HEIGHT,
  GEN_COMBO_FIX_PASSES,
  GEN_COMBO_MAX_RATIO,
  GEN_COMBO_MIN_RATIO,
  GEN_DENSITY_HARD_BLOCK,
  GEN_DENSITY_PENALTY,
  GEN_DENSITY_PENALTY_START,
  GEN_DENSITY_WINDOW,
  GEN_FUEL_BLOCK_CHANCE,
  GEN_FUEL_MIN_PER_ROWS,
  GEN_FUEL_NEAR_SIDE_BONUS,
  GEN_FUEL_SIDE_BONUS,
  GEN_MAX_COMPONENT,
  GEN_MAX_COMPONENT_RECOLOR_LIMIT,
  GEN_NEIGHBOR_BONUS_LEFT,
  GEN_NEIGHBOR_BONUS_MATCH,
  GEN_NEIGHBOR_BONUS_UP,
  GEN_STAMP_COUNT_PER_PASS,
  GEN_STAMP_TRIES,
  NATURAL_EMPTY_CHANCE,
  NATURAL_EMPTY_START_DEPTH,
  WORLD_WIDTH
} from "../constants";
import { BLOCK_COLORS, pickRandomBlockColor } from "../colors";
import { createBlock } from "../entities/Block";
import type { Block, BlockColor } from "../types";

export interface GeneratedRow {
  y: number;
  cells: Array<Block | null>;
}

export class ChunkGenerator {
  constructor(private readonly seed: number) {}

  generateChunk(chunkIndex: number): GeneratedRow[] {
    const startY = chunkIndex * CHUNK_HEIGHT;
    const rng = mulberry32(hash32(this.seed, chunkIndex, 0x9e3779b9));
    const grid: Array<Array<Block | null>> = Array.from({ length: CHUNK_HEIGHT }, () =>
      new Array<Block | null>(WORLD_WIDTH).fill(null)
    );

    for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
      const globalY = startY + localY;
      if (globalY < 0 || globalY === 0) {
        continue;
      }

      const sturdyChance = globalY < 12 ? 0.12 : 0.2;
      const unbreakableChance = globalY < 18 ? 0.03 : 0.08;
      const eventChance = 0.02;
      const naturalEmptyChance = globalY < NATURAL_EMPTY_START_DEPTH ? 0 : NATURAL_EMPTY_CHANCE;

      let unbreakableCount = 0;
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        if (rng() < naturalEmptyChance) {
          grid[localY][x] = null;
          continue;
        }

        if (rng() < this.fuelChanceForColumn(x)) {
          grid[localY][x] = createBlock("FUEL");
          continue;
        }

        const roll = rng();
        if (roll < 1 - sturdyChance - unbreakableChance - eventChance) {
          const color = this.pickColor(x, localY, grid, rng);
          grid[localY][x] = createBlock("BASIC", color);
        } else if (roll < 1 - unbreakableChance - eventChance) {
          const color = this.pickColor(x, localY, grid, rng);
          grid[localY][x] = createBlock("STURDY", color);
        } else if (roll < 1 - eventChance) {
          grid[localY][x] = createBlock("UNBREAKABLE");
          unbreakableCount += 1;
        } else {
          grid[localY][x] = createBlock("EVENT");
        }
      }

      if (unbreakableCount === WORLD_WIDTH) {
        const replaceX = Math.floor(rng() * WORLD_WIDTH);
        const color = this.pickColor(replaceX, localY, grid, rng);
        grid[localY][replaceX] = createBlock("BASIC", color);
      }
    }

    this.enforceFuelGuarantee(grid, startY, rng);
    this.enforceHardCapMaxComponent(grid, rng);
    this.adjustComboDensity(grid, rng);

    const rows: GeneratedRow[] = [];
    for (let localY = 0; localY < CHUNK_HEIGHT; localY += 1) {
      rows.push({
        y: startY + localY,
        cells: grid[localY]
      });
    }
    return rows;
  }

  private fuelChanceForColumn(x: number): number {
    if (x === 0 || x === WORLD_WIDTH - 1) {
      return GEN_FUEL_BLOCK_CHANCE * GEN_FUEL_SIDE_BONUS;
    }
    if (x === 1 || x === WORLD_WIDTH - 2) {
      return GEN_FUEL_BLOCK_CHANCE * GEN_FUEL_NEAR_SIDE_BONUS;
    }
    return GEN_FUEL_BLOCK_CHANCE;
  }

  private enforceFuelGuarantee(
    grid: Array<Array<Block | null>>,
    startY: number,
    rng: () => number
  ): void {
    for (let start = 0; start < CHUNK_HEIGHT; start += GEN_FUEL_MIN_PER_ROWS) {
      const end = Math.min(CHUNK_HEIGHT - 1, start + GEN_FUEL_MIN_PER_ROWS - 1);
      if (this.hasFuelInWindow(grid, start, end, startY)) {
        continue;
      }
      this.placeFuelInWindow(grid, start, end, startY, rng);
    }
  }

  private hasFuelInWindow(
    grid: Array<Array<Block | null>>,
    start: number,
    end: number,
    startY: number
  ): boolean {
    for (let y = start; y <= end; y += 1) {
      if (startY + y <= 0) {
        continue;
      }
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        if (grid[y][x]?.type === "FUEL") {
          return true;
        }
      }
    }
    return false;
  }

  private placeFuelInWindow(
    grid: Array<Array<Block | null>>,
    start: number,
    end: number,
    startY: number,
    rng: () => number
  ): void {
    const rows = shuffle(Array.from({ length: end - start + 1 }, (_, idx) => start + idx), rng)
      .filter((localY) => startY + localY > 0);

    const preferredColumns = shuffle([0, 1, WORLD_WIDTH - 2, WORLD_WIDTH - 1], rng);
    const fallbackColumns = shuffle(
      Array.from({ length: WORLD_WIDTH }, (_, x) => x).filter((x) => !preferredColumns.includes(x)),
      rng
    );
    const orderedColumns = [...preferredColumns, ...fallbackColumns];

    for (const y of rows) {
      for (const x of orderedColumns) {
        const block = grid[y][x];
        if (block?.type === "UNBREAKABLE") {
          continue;
        }
        grid[y][x] = createBlock("FUEL");
        return;
      }
    }
  }

  private pickColor(
    x: number,
    localY: number,
    grid: Array<Array<Block | null>>,
    rng: () => number
  ): BlockColor {
    const weights: Record<BlockColor, number> = {
      RED: 1,
      BLUE: 1,
      GREEN: 1,
      YELLOW: 1
    };

    const leftColor = this.getColoredBlockColor(grid, x - 1, localY);
    const upColor = this.getColoredBlockColor(grid, x, localY - 1);
    if (leftColor) {
      weights[leftColor] += GEN_NEIGHBOR_BONUS_LEFT;
    }
    if (upColor) {
      weights[upColor] += GEN_NEIGHBOR_BONUS_UP;
    }
    if (leftColor && upColor && leftColor === upColor) {
      weights[leftColor] += GEN_NEIGHBOR_BONUS_MATCH;
    }

    const colorCounts = this.collectLocalColorCounts(x, localY, grid);
    for (const color of BLOCK_COLORS) {
      const count = colorCounts[color];
      if (count >= GEN_DENSITY_HARD_BLOCK) {
        weights[color] = 0;
      } else if (count >= GEN_DENSITY_PENALTY_START) {
        weights[color] = Math.max(0, weights[color] - GEN_DENSITY_PENALTY);
      }
    }

    const available = BLOCK_COLORS.filter((color) => weights[color] > 0);
    if (available.length === 0) {
      return pickRandomBlockColor(rng);
    }

    return weightedPick(available, (color) => weights[color], rng);
  }

  private collectLocalColorCounts(
    x: number,
    localY: number,
    grid: Array<Array<Block | null>>
  ): Record<BlockColor, number> {
    const counts: Record<BlockColor, number> = {
      RED: 0,
      BLUE: 0,
      GREEN: 0,
      YELLOW: 0
    };

    const halfWindow = Math.floor(GEN_DENSITY_WINDOW / 2);
    for (let y = Math.max(0, localY - halfWindow); y <= localY; y += 1) {
      for (let nx = Math.max(0, x - halfWindow); nx <= Math.min(WORLD_WIDTH - 1, x + halfWindow); nx += 1) {
        if (y === localY && nx >= x) {
          continue;
        }
        const color = this.getColoredBlockColor(grid, nx, y);
        if (color) {
          counts[color] += 1;
        }
      }
    }

    return counts;
  }

  private adjustComboDensity(grid: Array<Array<Block | null>>, rng: () => number): void {
    for (let pass = 0; pass < GEN_COMBO_FIX_PASSES; pass += 1) {
      const components = findColorComponents(grid);
      const ratio = computeComboRatio(grid, components);
      if (ratio >= GEN_COMBO_MIN_RATIO && ratio <= GEN_COMBO_MAX_RATIO) {
        return;
      }

      if (ratio < GEN_COMBO_MIN_RATIO) {
        for (let stamp = 0; stamp < GEN_STAMP_COUNT_PER_PASS; stamp += 1) {
          this.placeStamp(grid, rng);
        }
        this.enforceHardCapMaxComponent(grid, rng);
        continue;
      }

      this.reduceComboDensity(grid, components, rng);
      this.enforceHardCapMaxComponent(grid, rng);
    }
  }

  private placeStamp(grid: Array<Array<Block | null>>, rng: () => number): void {
    for (let attempt = 0; attempt < GEN_STAMP_TRIES; attempt += 1) {
      const x = Math.floor(rng() * (WORLD_WIDTH - 1));
      const y = Math.floor(rng() * (CHUNK_HEIGHT - 1));

      let blocked = false;
      let mutableCount = 0;
      for (let oy = 0; oy < 2; oy += 1) {
        for (let ox = 0; ox < 2; ox += 1) {
          const block = grid[y + oy][x + ox];
          if (block?.type === "UNBREAKABLE") {
            blocked = true;
          }
          if (isColoredBlock(block)) {
            mutableCount += 1;
          }
        }
      }

      if (blocked || mutableCount === 0) {
        continue;
      }

      const color = pickRandomBlockColor(rng);
      for (let oy = 0; oy < 2; oy += 1) {
        for (let ox = 0; ox < 2; ox += 1) {
          const block = grid[y + oy][x + ox];
          if (isColoredBlock(block)) {
            block.color = color;
          }
        }
      }
      return;
    }
  }

  private reduceComboDensity(
    grid: Array<Array<Block | null>>,
    components: Component[],
    rng: () => number
  ): void {
    const comboCells = components
      .filter((component) => component.cells.length >= 4)
      .flatMap((component) => component.cells);

    if (comboCells.length === 0) {
      return;
    }

    for (let i = 0; i < GEN_STAMP_COUNT_PER_PASS; i += 1) {
      const cell = comboCells[Math.floor(rng() * comboCells.length)];
      if (!cell) {
        continue;
      }
      const block = grid[cell.y][cell.x];
      if (!isColoredBlock(block)) {
        continue;
      }
      const newColor = this.pickLeastLocalColor(grid, cell.x, cell.y, block.color, rng);
      block.color = newColor;
    }
  }

  private enforceHardCapMaxComponent(grid: Array<Array<Block | null>>, rng: () => number): void {
    let operations = 0;
    while (operations < GEN_MAX_COMPONENT_RECOLOR_LIMIT) {
      const components = findColorComponents(grid);
      const oversized = components.find((component) => component.cells.length > GEN_MAX_COMPONENT);
      if (!oversized) {
        return;
      }

      const target = pickSplitCandidate(grid, oversized, rng);
      const block = grid[target.y][target.x];
      if (!isColoredBlock(block)) {
        operations += 1;
        continue;
      }

      const newColor = this.pickLeastLocalColor(grid, target.x, target.y, block.color, rng);
      block.color = newColor;
      operations += 1;
    }
  }

  private pickLeastLocalColor(
    grid: Array<Array<Block | null>>,
    x: number,
    y: number,
    currentColor: BlockColor,
    rng: () => number
  ): BlockColor {
    const counts: Record<BlockColor, number> = {
      RED: 0,
      BLUE: 0,
      GREEN: 0,
      YELLOW: 0
    };

    for (let ny = Math.max(0, y - 1); ny <= Math.min(CHUNK_HEIGHT - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(WORLD_WIDTH - 1, x + 1); nx += 1) {
        const color = this.getColoredBlockColor(grid, nx, ny);
        if (color) {
          counts[color] += 1;
        }
      }
    }

    const candidates = BLOCK_COLORS.filter((color) => color !== currentColor);
    const minCount = Math.min(...candidates.map((color) => counts[color]));
    const lowest = candidates.filter((color) => counts[color] === minCount);
    return lowest[Math.floor(rng() * lowest.length)] ?? pickRandomBlockColor(rng);
  }

  private getColoredBlockColor(
    grid: Array<Array<Block | null>>,
    x: number,
    y: number
  ): BlockColor | undefined {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= CHUNK_HEIGHT) {
      return undefined;
    }
    const block = grid[y][x];
    if (!isColoredBlock(block)) {
      return undefined;
    }
    return block.color;
  }
}

interface ComponentCell {
  x: number;
  y: number;
}

interface Component {
  color: BlockColor;
  cells: ComponentCell[];
}

function isColoredBlock(block: Block | null | undefined): block is Block & { color: BlockColor } {
  return !!block && (block.type === "BASIC" || block.type === "STURDY") && !!block.color;
}

function findColorComponents(grid: Array<Array<Block | null>>): Component[] {
  const components: Component[] = [];
  const visited = new Set<string>();

  for (let y = 0; y < CHUNK_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const key = `${x},${y}`;
      if (visited.has(key)) {
        continue;
      }

      const start = grid[y][x];
      if (!isColoredBlock(start)) {
        continue;
      }

      const component: Component = { color: start.color, cells: [] };
      const queue: ComponentCell[] = [{ x, y }];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        const currentKey = `${current.x},${current.y}`;
        if (visited.has(currentKey)) {
          continue;
        }
        visited.add(currentKey);

        const block = grid[current.y][current.x];
        if (!isColoredBlock(block) || block.color !== component.color) {
          continue;
        }

        component.cells.push({ x: current.x, y: current.y });
        if (current.x > 0) {
          queue.push({ x: current.x - 1, y: current.y });
        }
        if (current.x < WORLD_WIDTH - 1) {
          queue.push({ x: current.x + 1, y: current.y });
        }
        if (current.y > 0) {
          queue.push({ x: current.x, y: current.y - 1 });
        }
        if (current.y < CHUNK_HEIGHT - 1) {
          queue.push({ x: current.x, y: current.y + 1 });
        }
      }

      if (component.cells.length > 0) {
        components.push(component);
      }
    }
  }

  return components;
}

function computeComboRatio(grid: Array<Array<Block | null>>, components: Component[]): number {
  let coloredCount = 0;
  for (let y = 0; y < CHUNK_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (isColoredBlock(grid[y][x])) {
        coloredCount += 1;
      }
    }
  }

  if (coloredCount === 0) {
    return 0;
  }

  const comboCells = components
    .filter((component) => component.cells.length >= 4)
    .reduce((sum, component) => sum + component.cells.length, 0);
  return comboCells / coloredCount;
}

function pickSplitCandidate(grid: Array<Array<Block | null>>, component: Component, rng: () => number): ComponentCell {
  const bridgeLike = component.cells.filter((cell) => {
    const block = grid[cell.y][cell.x];
    if (!isColoredBlock(block)) {
      return false;
    }
    const neighbors = sameColorNeighbors(grid, cell.x, cell.y, component.color);
    return neighbors === 1 || neighbors === 2;
  });

  const pool = bridgeLike.length > 0 ? bridgeLike : component.cells;
  return pool[Math.floor(rng() * pool.length)] ?? component.cells[0];
}

function sameColorNeighbors(
  grid: Array<Array<Block | null>>,
  x: number,
  y: number,
  color: BlockColor
): number {
  let count = 0;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= CHUNK_HEIGHT) {
      continue;
    }
    const neighbor = grid[ny][nx];
    if (isColoredBlock(neighbor) && neighbor.color === color) {
      count += 1;
    }
  }

  return count;
}

function weightedPick<T>(items: T[], weightOf: (item: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) {
    return items[Math.floor(rng() * items.length)] ?? items[0];
  }

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) {
      return item;
    }
  }
  return items[items.length - 1] ?? items[0];
}

function shuffle<T>(source: T[], rng: () => number): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
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
