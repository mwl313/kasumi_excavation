import {
  ACTIVE_CHECK_DOWN_ROWS,
  ACTIVE_CHECK_UP_ROWS,
  BEST_DEPTH_STORAGE_KEY,
  CAMERA_OFFSET_ROWS,
  CAMERA_SMOOTH_SPEED,
  CHAIN_WINDOW_TURNS,
  CLUSTER_SCAN_DOWN,
  CLUSTER_SCAN_UP,
  FUEL_COST_INVALID,
  FUEL_COST_JUMP,
  FUEL_COST_MINE_ATTEMPT,
  FUEL_COST_MOVE_EMPTY,
  FUEL_MAX,
  FUEL_REBATE_BASE,
  FUEL_REBATE_CHAIN_CAP,
  FUEL_REBATE_SCALE,
  GENERATE_AHEAD_ROWS,
  OD_DURATION,
  OD_GAIN_BASE,
  OD_GAIN_CHAIN_CAP,
  OD_GAIN_SCALE,
  OD_MAX,
  PLAYER_ACTION_INTERVAL,
  PLAYER_GRAVITY,
  PLAYER_MAX_VY,
  PRUNE_ROWS_ABOVE
} from "./constants";
import { Player } from "./entities/Player";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { updateFallingGroups } from "./systems/FallingBlocks";
import type { Block, Direction } from "./types";
import { World } from "./world/World";

type FuelActionType = "MOVE_EMPTY" | "JUMP" | "MINE_ATTEMPT" | "INVALID";

interface ActionOutcome {
  fuelAction: FuelActionType;
  comboAffected: number;
}

interface HudElements {
  hpValue: HTMLElement;
  depthValue: HTMLElement;
  bestValue: HTMLElement;
  fuelValue: HTMLElement;
  fuelFill: HTMLElement;
  comboValue: HTMLElement;
  comboFill: HTMLElement;
  chainValue: HTMLElement;
  modeValue: HTMLElement;
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
  private cameraY = 0;

  private fuel = FUEL_MAX;
  private limpMode = false;
  private comboGauge = 0;
  private overdriveActive = false;
  private overdriveTimeLeft = 0;
  private turnsSinceCombo = CHAIN_WINDOW_TURNS + 1;
  private chainLevel = 0;

  constructor(canvas: HTMLCanvasElement, hud: HudElements) {
    this.hud = hud;
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.bestDepth = this.loadBestDepth();

    const seed = this.newSeed();
    this.world = new World(seed);
    this.player = new Player(3, 0);
    this.cameraY = this.player.y - CAMERA_OFFSET_ROWS;
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
      this.updateCamera(dt);
      this.updateHud();
      return;
    }

    this.player.updateTimers(dt);
    this.tickOverdrive(dt);

    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (this.actionCooldown <= 0) {
      const action = this.input.consumeDirection();
      if (action) {
        const outcome = this.handleAction(action);
        this.finalizeActionOutcome(outcome);
        this.actionCooldown = PLAYER_ACTION_INTERVAL;
      }
    }

    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);
    this.world.updateInstabilityGroups(
      dt,
      this.player.y - ACTIVE_CHECK_UP_ROWS,
      this.player.y + ACTIVE_CHECK_DOWN_ROWS
    );
    updateFallingGroups(this.world, this.player, dt, {
      consumeShieldHit: () => false
    });
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
    this.updateCamera(dt);
    this.updateHud();
  }

  render(): void {
    this.renderer.render(this.world, this.player, this.gameOver, this.cameraY);
  }

  restart(): void {
    const newSeed = this.newSeed();
    this.world = new World(newSeed);
    this.player.reset(3, 0);
    this.player.snapRenderPosition();
    this.cameraY = this.player.y - CAMERA_OFFSET_ROWS;
    this.world.initializeSpawn(this.player.x, this.player.y);
    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);

    this.depth = 0;
    this.gameOver = false;
    this.actionCooldown = 0;
    this.fuel = FUEL_MAX;
    this.limpMode = false;
    this.comboGauge = 0;
    this.overdriveActive = false;
    this.overdriveTimeLeft = 0;
    this.turnsSinceCombo = CHAIN_WINDOW_TURNS + 1;
    this.chainLevel = 0;

    this.input.clear();
    this.syncGroundedState();
    this.updateHud();
  }

  private handleAction(direction: Direction): ActionOutcome {
    this.player.setFacing(direction);

    if (direction === "UP") {
      return this.handleUpAction();
    }

    if (direction === "DOWN" && !this.player.isGrounded) {
      return { fuelAction: "INVALID", comboAffected: 0 };
    }

    const [dx, dy] = deltaForDirection(direction);
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;
    if (!this.world.isInsideX(targetX)) {
      return { fuelAction: "INVALID", comboAffected: 0 };
    }

    return this.tryMoveOrMine(targetX, targetY, false);
  }

  private handleUpAction(): ActionOutcome {
    const targetX = this.player.x;
    const targetY = this.player.y - 1;
    const aboveBlock = this.world.getBlock(targetX, targetY);

    if (!aboveBlock) {
      if (!this.player.isGrounded) {
        return { fuelAction: "INVALID", comboAffected: 0 };
      }
      if (this.limpMode) {
        return { fuelAction: "INVALID", comboAffected: 0 };
      }
      if (!this.world.isCellEmpty(targetX, targetY)) {
        return { fuelAction: "INVALID", comboAffected: 0 };
      }
      this.movePlayerTo(targetX, targetY);
      this.player.setAirborne();
      return { fuelAction: "JUMP", comboAffected: 0 };
    }

    if (!this.player.isGrounded) {
      return { fuelAction: "INVALID", comboAffected: 0 };
    }

    const comboAffected = this.mineTargetBlock(aboveBlock, targetX, targetY, true);
    return { fuelAction: "MINE_ATTEMPT", comboAffected };
  }

  private tryMoveOrMine(targetX: number, targetY: number, isUpward: boolean): ActionOutcome {
    if (!this.world.isCellEmpty(targetX, targetY)) {
      const targetBlock = this.world.getBlock(targetX, targetY);
      if (!targetBlock) {
        return { fuelAction: "INVALID", comboAffected: 0 };
      }
      const comboAffected = this.mineTargetBlock(targetBlock, targetX, targetY, isUpward);
      return { fuelAction: "MINE_ATTEMPT", comboAffected };
    }

    this.movePlayerTo(targetX, targetY);
    return { fuelAction: "MOVE_EMPTY", comboAffected: 0 };
  }

  private mineTargetBlock(block: Block, targetX: number, targetY: number, isUpward: boolean): number {
    const triggerColor = block.color;

    if (this.overdriveActive) {
      const broke = this.applyOverdriveMining(block, targetX, targetY, isUpward);
      return broke && triggerColor
        ? this.tryClusterFromAction(targetX, targetY, triggerColor)
        : 0;
    }

    if (this.limpMode) {
      const broke = this.applyLimpMining(block, targetX, targetY, isUpward);
      return broke && triggerColor
        ? this.tryClusterFromAction(targetX, targetY, triggerColor)
        : 0;
    }

    const broke = this.applyNormalMining(block, targetX, targetY, isUpward);
    return broke && triggerColor
      ? this.tryClusterFromAction(targetX, targetY, triggerColor)
      : 0;
  }

  private applyNormalMining(block: Block, targetX: number, targetY: number, isUpward: boolean): boolean {
    if (block.type === "UNBREAKABLE") {
      return false;
    }

    if (block.type === "STURDY") {
      const nextHp = (block.hp ?? 2) - 1;
      block.hp = Math.max(0, nextHp);
      if (block.hp > 0) {
        return false;
      }
      this.breakAndMove(targetX, targetY, isUpward);
      return true;
    }

    if (block.type === "EVENT") {
      const eventName = block.eventId ?? "placeholder_event";
      console.log(`[EVENT] Triggered: ${eventName}`);
    }

    this.breakAndMove(targetX, targetY, isUpward);
    return true;
  }

  private applyLimpMining(block: Block, targetX: number, targetY: number, isUpward: boolean): boolean {
    if (block.type === "UNBREAKABLE") {
      return false;
    }

    if (block.type === "STURDY") {
      return false;
    }

    if (block.type === "BASIC") {
      const currentHp = block.hp ?? 1;
      if (currentHp > 1) {
        block.hp = currentHp - 1;
        return false;
      }
      if (currentHp === 1) {
        block.hp = 0;
        return false;
      }
      this.breakAndMove(targetX, targetY, isUpward);
      return true;
    }

    this.breakAndMove(targetX, targetY, isUpward);
    return true;
  }

  private applyOverdriveMining(block: Block, targetX: number, targetY: number, isUpward: boolean): boolean {
    if (block.type === "UNBREAKABLE") {
      if (!block.cracked) {
        block.cracked = true;
        return false;
      }
      this.breakAndMove(targetX, targetY, isUpward);
      return true;
    }

    if (block.type === "STURDY") {
      this.breakAndMove(targetX, targetY, isUpward);
      return true;
    }

    this.breakAndMove(targetX, targetY, isUpward);
    return true;
  }

  private breakAndMove(targetX: number, targetY: number, isUpward: boolean): void {
    this.world.excavateBlock(targetX, targetY);
    this.movePlayerTo(targetX, targetY);
    if (isUpward) {
      this.player.setAirborne();
    }
  }

  private tryClusterFromAction(x: number, y: number, color: NonNullable<Block["color"]>): number {
    const result = this.world.tryClusterClearFrom(x, y, color, {
      source: "MINING",
      minY: this.player.y - CLUSTER_SCAN_UP,
      maxY: this.player.y + CLUSTER_SCAN_DOWN
    });

    if (result.totalAffected <= 0) {
      return 0;
    }

    return result.removedBasic + result.damagedSturdy + result.removedSturdy;
  }

  private finalizeActionOutcome(outcome: ActionOutcome): void {
    this.applyFuelCost(outcome.fuelAction);
    this.turnsSinceCombo += 1;

    if (outcome.comboAffected > 0) {
      this.applyComboEvent(outcome.comboAffected);
    }
  }

  private applyFuelCost(actionType: FuelActionType): void {
    if (this.overdriveActive || this.limpMode) {
      return;
    }

    const cost = fuelCostForAction(actionType);
    this.fuel = Math.max(0, this.fuel - cost);
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.limpMode = true;
    }
  }

  private applyComboEvent(affected: number): void {
    if (this.turnsSinceCombo <= CHAIN_WINDOW_TURNS) {
      this.chainLevel = this.chainLevel > 0 ? this.chainLevel + 1 : 1;
    } else {
      this.chainLevel = 1;
    }
    this.turnsSinceCombo = 0;

    const rebate =
      FUEL_REBATE_BASE +
      affected * FUEL_REBATE_SCALE +
      Math.min(FUEL_REBATE_CHAIN_CAP, this.chainLevel);
    this.fuel = Math.min(FUEL_MAX, this.fuel + rebate);
    if (this.fuel >= 1) {
      this.limpMode = false;
    }

    if (this.overdriveActive) {
      return;
    }

    const gain =
      OD_GAIN_BASE +
      affected * OD_GAIN_SCALE +
      Math.min(OD_GAIN_CHAIN_CAP, this.chainLevel * 2);
    this.comboGauge = Math.min(OD_MAX, this.comboGauge + gain);

    if (this.comboGauge >= OD_MAX) {
      this.startOverdrive();
    }
  }

  private startOverdrive(): void {
    this.overdriveActive = true;
    this.overdriveTimeLeft = OD_DURATION;
    this.comboGauge = OD_MAX;
    this.fuel = FUEL_MAX;
    this.limpMode = false;
  }

  private tickOverdrive(dt: number): void {
    if (!this.overdriveActive) {
      return;
    }

    this.overdriveTimeLeft -= dt;
    const ratio = clamp01(this.overdriveTimeLeft / OD_DURATION);
    this.comboGauge = Math.ceil(OD_MAX * ratio);

    if (this.overdriveTimeLeft <= 0) {
      this.overdriveActive = false;
      this.overdriveTimeLeft = 0;
      this.comboGauge = 0;
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

    this.player.accumulateFall(dt, PLAYER_GRAVITY, PLAYER_MAX_VY);
    while (this.player.fallDistanceBuffer >= 1) {
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
      this.player.fallDistanceBuffer -= 1;
    }
  }

  private updateHud(): void {
    this.hud.hpValue.textContent = String(this.player.hp);
    this.hud.depthValue.textContent = String(this.depth);
    this.hud.bestValue.textContent = String(this.bestDepth);

    this.hud.fuelValue.textContent = `${Math.floor(this.fuel)}/${FUEL_MAX}`;
    this.hud.fuelFill.style.width = `${(this.fuel / FUEL_MAX) * 100}%`;

    this.hud.comboValue.textContent = `${Math.floor(this.comboGauge)}/${OD_MAX}`;
    this.hud.comboFill.style.width = `${(this.comboGauge / OD_MAX) * 100}%`;

    this.hud.chainValue.textContent = this.chainLevel > 0 ? `x${this.chainLevel}` : "-";

    const flags: string[] = [];
    if (this.overdriveActive) {
      flags.push(`OVERDRIVE ${this.overdriveTimeLeft.toFixed(1)}s`);
    }
    if (this.limpMode) {
      flags.push("LIMP");
    }
    this.hud.modeValue.textContent = flags.length > 0 ? flags.join(" | ") : "NORMAL";

    this.hud.restartButton.hidden = !this.gameOver;
  }

  private updateCamera(dt: number): void {
    const target = this.player.renderY - CAMERA_OFFSET_ROWS;
    const step = CAMERA_SMOOTH_SPEED * dt;
    this.cameraY = moveToward(this.cameraY, target, step);
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

function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

function fuelCostForAction(action: FuelActionType): number {
  switch (action) {
    case "MOVE_EMPTY":
      return FUEL_COST_MOVE_EMPTY;
    case "JUMP":
      return FUEL_COST_JUMP;
    case "MINE_ATTEMPT":
      return FUEL_COST_MINE_ATTEMPT;
    case "INVALID":
    default:
      return FUEL_COST_INVALID;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}