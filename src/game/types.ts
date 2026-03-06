export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type PlayerState = "Grounded" | "Airborne";

export type BlockType = "BASIC" | "STURDY" | "UNBREAKABLE" | "EVENT" | "FUEL";
export type BlockColor = "RED" | "BLUE" | "GREEN" | "YELLOW";
export type FallState = "STATIC" | "SHAKING" | "FALLING";

export interface Block {
  type: BlockType;
  hp: number | null;
  color?: BlockColor;
  cracked?: boolean;
  eventId?: string;
  fallState: FallState;
  shakeTimer: number;
  vy: number;
  yFloat: number;
}

export interface FallingMember {
  x: number;
  yOffset: number;
  type: BlockType;
  hp: number | null;
  color?: BlockColor;
  cracked?: boolean;
  eventId?: string;
}

export interface FallingGroup {
  id: number;
  state: "SHAKING" | "FALLING";
  shakeTimer: number;
  yBase: number;
  yFloat: number;
  vy: number;
  members: FallingMember[];
}

export interface StaticBlockSnapshot {
  x: number;
  y: number;
  block: Block;
}
