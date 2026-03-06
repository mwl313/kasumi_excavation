import type { Direction } from "../types";

const DIRECTION_KEYS: Record<string, Direction> = {
  arrowup: "UP",
  w: "UP",
  arrowdown: "DOWN",
  s: "DOWN",
  arrowleft: "LEFT",
  a: "LEFT",
  arrowright: "RIGHT",
  d: "RIGHT"
};

export class Input {
  private readonly queue: Direction[] = [];
  private restartRequested = false;
  private readonly onKeyDownBound: (event: KeyboardEvent) => void;

  constructor() {
    this.onKeyDownBound = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDownBound);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDownBound);
  }

  clear(): void {
    this.queue.length = 0;
    this.restartRequested = false;
  }

  consumeDirection(): Direction | null {
    return this.queue.shift() ?? null;
  }

  consumeRestart(): boolean {
    const value = this.restartRequested;
    this.restartRequested = false;
    return value;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "r") {
      this.restartRequested = true;
      event.preventDefault();
      return;
    }

    const direction = DIRECTION_KEYS[key];
    if (!direction) {
      return;
    }

    if (this.queue.length < 8) {
      this.queue.push(direction);
    }
    event.preventDefault();
  }
}