import {
  ACTIVE_CHECK_DOWN_ROWS,
  ACTIVE_CHECK_UP_ROWS,
  ANCHOR_DURATION,
  BEST_DEPTH_STORAGE_KEY,
  CAMERA_OFFSET_ROWS,
  CAMERA_SMOOTH_SPEED,
  CLUSTER_SCAN_DOWN,
  CLUSTER_SCAN_UP,
  GENERATE_AHEAD_ROWS,
  PLAYER_ACTION_INTERVAL,
  PLAYER_GRAVITY,
  PLAYER_IFRAME_DURATION,
  PLAYER_MAX_VY,
  PRUNE_ROWS_ABOVE,
  RESONANCE_COST,
  RESONANCE_MAX,
  WORLD_WIDTH
} from "./constants";
import { Player } from "./entities/Player";
import { Input } from "./input/Input";
import { Renderer } from "./render/Renderer";
import { updateFallingGroups } from "./systems/FallingBlocks";
import type { Block, BlockColor, Direction } from "./types";
import { World } from "./world/World";

interface HudElements {
  hpValue: HTMLElement;
  depthValue: HTMLElement;
  bestValue: HTMLElement;
  colorValue: HTMLElement;
  resValue: HTMLElement;
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

  private selectedColor: BlockColor = "RED";
  private resonance: Record<BlockColor, number> = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    YELLOW: 0
  };
  private anchorUntilMs = 0;
  private anchorCenter: { x: number; y: number } | null = null;
  private shieldCharges = 0;

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

    const selected = this.input.consumeSelectColor();
    if (selected) {
      this.selectedColor = selected;
    }

    if (this.input.consumeCastAbility()) {
      this.tryCastSelectedAbility();
    }

    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (this.actionCooldown <= 0) {
      const action = this.input.consumeDirection();
      if (action) {
        this.handleAction(action);
        this.actionCooldown = PLAYER_ACTION_INTERVAL;
      }
    }

    this.syncAnchorField(performance.now());

    this.world.ensureGeneratedThrough(this.player.y + GENERATE_AHEAD_ROWS);
    this.world.updateInstabilityGroups(
      dt,
      this.player.y - ACTIVE_CHECK_UP_ROWS,
      this.player.y + ACTIVE_CHECK_DOWN_ROWS
    );
    updateFallingGroups(this.world, this.player, dt, {
      consumeShieldHit: () => this.consumeShieldOnHit()
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
    this.selectedColor = "RED";
    this.resonance = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 };
    this.anchorUntilMs = 0;
    this.anchorCenter = null;
    this.shieldCharges = 0;

    this.input.clear();
    this.syncAnchorField(performance.now());
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

    const triggerColor = block.color;

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
      this.applyClusterResonance(targetX, targetY, triggerColor);
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
    this.applyClusterResonance(targetX, targetY, triggerColor);
  }

  private applyClusterResonance(x: number, y: number, color: BlockColor | undefined): void {
    if (!color) {
      return;
    }

    const result = this.world.tryClusterClearFrom(x, y, color, {
      source: "MINING",
      minY: this.player.y - CLUSTER_SCAN_UP,
      maxY: this.player.y + CLUSTER_SCAN_DOWN
    });

    if (result.totalAffected <= 0) {
      return;
    }

    this.resonance[color] = Math.min(RESONANCE_MAX, this.resonance[color] + result.totalAffected);
  }

  private tryCastSelectedAbility(): void {
    if (this.resonance[this.selectedColor] < RESONANCE_COST) {
      return;
    }

    this.resonance[this.selectedColor] -= RESONANCE_COST;

    switch (this.selectedColor) {
      case "RED":
        this.castRedOverheatBurst();
        break;
      case "BLUE":
        this.castBlueAnchorField();
        break;
      case "GREEN":
        this.castGreenShield();
        break;
      case "YELLOW":
        this.castYellowHorizontalBore();
        break;
      default:
        break;
    }
  }

  private castRedOverheatBurst(): void {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        this.applyAbilityImpactAt(this.player.x + dx, this.player.y + dy);
      }
    }
  }

  private castBlueAnchorField(): void {
    this.anchorCenter = { x: this.player.x, y: this.player.y };
    this.anchorUntilMs = performance.now() + ANCHOR_DURATION * 1000;
  }

  private castGreenShield(): void {
    this.shieldCharges = 1;
  }

  private castYellowHorizontalBore(): void {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      this.applyAbilityImpactAt(x, this.player.y);
    }
  }

  private applyAbilityImpactAt(x: number, y: number): void {
    if (!this.world.isInsideX(x)) {
      return;
    }

    const block = this.world.getBlock(x, y);
    if (!block) {
      return;
    }

    if (block.type === "UNBREAKABLE") {
      return;
    }

    if (block.type === "STURDY") {
      const nextHp = (block.hp ?? 2) - 1;
      block.hp = Math.max(0, nextHp);
      if (block.hp <= 0) {
        this.world.excavateBlock(x, y);
      }
      return;
    }

    this.world.excavateBlock(x, y);
  }

  private syncAnchorField(nowMs: number): void {
    if (!this.anchorCenter || nowMs >= this.anchorUntilMs) {
      this.anchorCenter = null;
      this.world.setAnchorField(null);
      return;
    }

    this.world.setAnchorField({
      minX: this.anchorCenter.x - 1,
      maxX: this.anchorCenter.x + 1,
      minY: this.anchorCenter.y + 1,
      maxY: this.anchorCenter.y + 4
    });
  }

  private consumeShieldOnHit(): boolean {
    if (this.shieldCharges <= 0) {
      return false;
    }

    this.shieldCharges -= 1;
    this.player.iFrameTimer = Math.max(this.player.iFrameTimer, PLAYER_IFRAME_DURATION * 0.5);
    return true;
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
    this.hud.colorValue.textContent = this.selectedColor;

    const resText = `R:${this.resonance.RED} B:${this.resonance.BLUE} G:${this.resonance.GREEN} Y:${this.resonance.YELLOW}`;
    const shieldText = this.shieldCharges > 0 ? " | Shield:ON" : "";
    const anchorActive = this.anchorCenter && performance.now() < this.anchorUntilMs;
    const anchorText = anchorActive ? " | Anchor:ON" : "";
    this.hud.resValue.textContent = `${resText}${shieldText}${anchorText}`;

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
