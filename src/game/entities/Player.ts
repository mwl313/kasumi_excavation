import {
  PLAYER_IFRAME_DURATION,
  PLAYER_MOVE_SPEED,
  PLAYER_MAX_HP
} from "../constants";
import type { Direction, PlayerState } from "../types";

export class Player {
  x: number;
  y: number;
  hp: number;
  facing: Direction;
  state: PlayerState;
  iFrameTimer: number;
  fallVy: number;
  fallDistanceBuffer: number;
  ridingGroupId: number | null;
  renderX: number;
  renderY: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.facing = "RIGHT";
    this.state = "Grounded";
    this.iFrameTimer = 0;
    this.fallVy = 0;
    this.fallDistanceBuffer = 0;
    this.ridingGroupId = null;
    this.renderX = x;
    this.renderY = y;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.facing = "RIGHT";
    this.state = "Grounded";
    this.iFrameTimer = 0;
    this.fallVy = 0;
    this.fallDistanceBuffer = 0;
    this.ridingGroupId = null;
    this.renderX = x;
    this.renderY = y;
  }

  setFacing(direction: Direction): void {
    this.facing = direction;
  }

  setGrounded(): void {
    this.state = "Grounded";
    this.fallVy = 0;
    this.fallDistanceBuffer = 0;
  }

  setAirborne(): void {
    if (this.state === "Grounded") {
      this.fallVy = 0;
      this.fallDistanceBuffer = 0;
    }
    this.state = "Airborne";
  }

  get isGrounded(): boolean {
    return this.state === "Grounded";
  }

  updateTimers(dt: number): void {
    if (this.iFrameTimer > 0) {
      this.iFrameTimer = Math.max(0, this.iFrameTimer - dt);
    }
  }

  tryDamage(amount: number): boolean {
    if (this.iFrameTimer > 0) {
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.iFrameTimer = PLAYER_IFRAME_DURATION;
    return true;
  }

  accumulateFall(dt: number, gravity: number, maxVy: number): void {
    this.fallVy = Math.min(maxVy, this.fallVy + gravity * dt);
    this.fallDistanceBuffer += this.fallVy * dt;
  }

  updateRenderPosition(dt: number): void {
    this.renderX = moveToward(this.renderX, this.x, PLAYER_MOVE_SPEED * dt);
    this.renderY = moveToward(this.renderY, this.y, PLAYER_MOVE_SPEED * dt);
  }

  snapRenderPosition(): void {
    this.renderX = this.x;
    this.renderY = this.y;
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}
