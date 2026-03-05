import {
  ACTIVE_CHECK_DOWN_ROWS,
  ACTIVE_CHECK_UP_ROWS,
  BEST_DEPTH_STORAGE_KEY,
  GENERATE_AHEAD_ROWS,
  PLAYER_ACTION_INTERVAL,
  PLAYER_FALL_INTERVAL,
  PRUNE_ROWS_ABOVE
} from "./constants";
import { Player } from "./entities/Player";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { updateFallingGroups } from "./systems/FallingBlocks";
import type { Block, Direction } from "./types";
import { World } from "./world/World";

interface HudElements {
  hpValue: HTMLElement;
  depthValue: HTMLElement;
  bestValue: HTMLElement;
  restartButton: HTMLButtonElement;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly hud: HudElements;

  private world: World;
  private player: Player;
  private actionCooldown = 0;
  private depth = 0;
  private bestDepth = 0;
  private gameOver = false;

  constructor(canvas: HTMLCanvasElement, hud: HudElements) {
    this.hud = hud;
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.bestDepth = this.loadBestDepth();

    const seed = this.newSeed();
    this.world = new World(seed);
    this.player = new Player(3, 0);
    this.world.initializeSpawn(this.player.x, this.player.y);
    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);
    this.syncGroundedState();
    this.updateHud();
  }

  update(dt: number): void {
    if (this.input.consumeRestart()) {
      this.restart();
      return;
    }

    if (this.gameOver) {
      this.player.updateRenderPosition(dt);
      this.updateHud();
      return;
    }

    this.player.updateTimers(dt);
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);

    if (this.actionCooldown <= 0) {
      const action = this.input.consumeDirection();
      if (action) {
        this.handleAction(action);
        this.actionCooldown = PLAYER_ACTION_INTERVAL;
      }
    }

    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);
    this.world.updateInstabilityGroups(
      dt,
      this.player.y - ACTIVE_CHECK_UP_ROWS,
      this.player.y + ACTIVE_CHECK_DOWN_ROWS
    );
    updateFallingGroups(this.world, this.player, dt);
    this.applyPlayerGravity(dt);
    this.world.pruneRowsAbove(this.player.y - PRUNE_ROWS_ABOVE);

    this.depth = Math.max(this.depth, this.player.y);
    if (this.depth > this.bestDepth) {
      this.bestDepth = this.depth;
      this.saveBestDepth(this.bestDepth);
    }

    if (this.player.hp <= 0) {
      this.gameOver = true;
    }

    this.player.updateRenderPosition(dt);
    this.updateHud();
  }

  render(): void {
    this.renderer.render(this.world, this.player, this.gameOver);
  }

  restart(): void {
    const newSeed = this.newSeed();
    this.world = new World(newSeed);
    this.player.reset(3, 0);
    this.player.fallTimer = PLAYER_FALL_INTERVAL;
    this.player.snapRenderPosition();
    this.world.initializeSpawn(this.player.x, this.player.y);
    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);
    this.depth = 0;
    this.gameOver = false;
    this.actionCooldown = 0;
    this.input.clear();
    this.syncGroundedState();
    this.updateHud();
  }

  private handleAction(direction: Direction): void {
    this.player.setFacing(direction);

    if (direction === "UP") {
      this.handleUpAction();
      return;
    }

    if (direction === "DOWN" && !this.player.isGrounded) {
      return;
    }

    const [dx, dy] = deltaForDirection(direction);
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;
    if (!this.world.isInsideX(targetX)) {
      return;
    }

    this.tryMoveOrMine(targetX, targetY);
  }

  private handleUpAction(): void {
    const targetX = this.player.x;
    const targetY = this.player.y - 1;
    const aboveBlock = this.world.getBlock(targetX, targetY);

    if (!aboveBlock) {
      if (!this.player.isGrounded) {
        return;
      }
      if (!this.world.isCellEmpty(targetX, targetY)) {
        return;
      }
      this.movePlayerTo(targetX, targetY);
      this.player.setAirborne();
      return;
    }

    if (!this.player.isGrounded) {
      return;
    }

    this.interactWithBlock(aboveBlock, targetX, targetY, true);
  }

  private tryMoveOrMine(targetX: number, targetY: number): void {
    if (!this.world.isCellEmpty(targetX, targetY)) {
      const targetBlock = this.world.getBlock(targetX, targetY);
      if (!targetBlock) {
        return;
      }
      this.interactWithBlock(targetBlock, targetX, targetY, false);
      return;
    }

    this.movePlayerTo(targetX, targetY);
  }

  private interactWithBlock(
    block: Block,
    targetX: number,
    targetY: number,
    isUpward: boolean
  ): void {
    if (block.type === "UNBREAKABLE") {
      return;
    }

    if (block.type === "STURDY") {
      const nextHp = (block.hp ?? 2) - 1;
      block.hp = Math.max(0, nextHp);
      if (block.hp > 0) {
        return;
      }
      this.world.excavateBlock(targetX, targetY);
      this.movePlayerTo(targetX, targetY);
      if (isUpward) {
        this.player.setAirborne();
      }
      return;
    }

    if (block.type === "EVENT") {
      const eventName = block.eventId ?? "placeholder_event";
      console.log(`[EVENT] Triggered: ${eventName}`);
    }

    this.world.excavateBlock(targetX, targetY);
    this.movePlayerTo(targetX, targetY);
    if (isUpward) {
      this.player.setAirborne();
    }
  }

  private movePlayerTo(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
    this.syncGroundedState();
  }

  private syncGroundedState(): void {
    const staticSupport = !this.world.isStaticCellEmpty(this.player.x, this.player.y + 1);
    const fallingSupport = this.world.getSupportingFallingGroupUnderPlayer(
      this.player.x,
      this.player.y
    );

    if (staticSupport) {
      this.player.ridingGroupId = null;
      this.player.setGrounded();
      return;
    }

    if (fallingSupport) {
      this.player.ridingGroupId = fallingSupport.groupId;
      this.player.setGrounded();
      return;
    }

    this.player.ridingGroupId = null;
    this.player.setAirborne();
  }

  private applyPlayerGravity(dt: number): void {
    if (this.player.ridingGroupId !== null) {
      const support = this.world.getSupportingFallingGroupUnderPlayer(this.player.x, this.player.y);
      if (support && support.groupId === this.player.ridingGroupId) {
        this.player.setGrounded();
        return;
      }
      this.player.ridingGroupId = null;
    }

    const staticSupport = !this.world.isStaticCellEmpty(this.player.x, this.player.y + 1);
    const fallingSupport = this.world.getSupportingFallingGroupUnderPlayer(
      this.player.x,
      this.player.y
    );

    if (this.player.isGrounded) {
      if (staticSupport) {
        return;
      }
      if (fallingSupport) {
        this.player.ridingGroupId = fallingSupport.groupId;
        return;
      }
      this.player.setAirborne();
    }

    this.player.fallTimer -= dt;
    while (this.player.fallTimer <= 0) {
      const hasStaticSupport = !this.world.isStaticCellEmpty(this.player.x, this.player.y + 1);
      const hasFallingSupport = this.world.getSupportingFallingGroupUnderPlayer(
        this.player.x,
        this.player.y
      );

      if (hasStaticSupport) {
        this.player.ridingGroupId = null;
        this.player.setGrounded();
        break;
      }

      if (hasFallingSupport) {
        this.player.ridingGroupId = hasFallingSupport.groupId;
        this.player.setGrounded();
        break;
      }

      this.player.y += 1;
      this.player.fallTimer += PLAYER_FALL_INTERVAL;
    }
  }

  private updateHud(): void {
    this.hud.hpValue.textContent = String(this.player.hp);
    this.hud.depthValue.textContent = String(this.depth);
    this.hud.bestValue.textContent = String(this.bestDepth);
    this.hud.restartButton.hidden = !this.gameOver;
  }

  private loadBestDepth(): number {
    const raw = localStorage.getItem(BEST_DEPTH_STORAGE_KEY);
    if (!raw) {
      return 0;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  private saveBestDepth(depth: number): void {
    localStorage.setItem(BEST_DEPTH_STORAGE_KEY, String(depth));
  }

  private newSeed(): number {
    return (Math.random() * 0xffffffff) >>> 0;
  }
}

function deltaForDirection(direction: Direction): [number, number] {
  switch (direction) {
    case "LEFT":
      return [-1, 0];
    case "RIGHT":
      return [1, 0];
    case "DOWN":
      return [0, 1];
    case "UP":
      return [0, -1];
    default:
      return [0, 0];
  }
}
