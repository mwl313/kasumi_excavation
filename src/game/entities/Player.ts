import {
  PLAYER_FALL_INTERVAL,
  PLAYER_IFRAME_DURATION,
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
  fallTimer: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.facing = "RIGHT";
    this.state = "Grounded";
    this.iFrameTimer = 0;
    this.fallTimer = PLAYER_FALL_INTERVAL;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.facing = "RIGHT";
    this.state = "Grounded";
    this.iFrameTimer = 0;
    this.fallTimer = PLAYER_FALL_INTERVAL;
  }

  setFacing(direction: Direction): void {
    this.facing = direction;
  }

  setGrounded(): void {
    this.state = "Grounded";
    this.fallTimer = PLAYER_FALL_INTERVAL;
  }

  setAirborne(): void {
    this.state = "Airborne";
    if (this.fallTimer <= 0) {
      this.fallTimer = PLAYER_FALL_INTERVAL;
    }
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
}