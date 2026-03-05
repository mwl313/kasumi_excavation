export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type PlayerState = "Grounded" | "Airborne";

export type BlockType = "BASIC" | "STURDY" | "UNBREAKABLE" | "EVENT";
export type FallState = "STATIC" | "SHAKING" | "FALLING";

export interface Block {
  type: BlockType;
  hp: number | null;
  eventId?: string;
  fallState: FallState;
  shakeTimer: number;
  vy: number;
  yFloat: number;
}

export interface FallingBlock {
  x: number;
  yFloat: number;
  type: BlockType;
  hp: number | null;
  eventId?: string;
  vy: number;
}

export interface StaticBlockSnapshot {
  x: number;
  y: number;
  block: Block;
}