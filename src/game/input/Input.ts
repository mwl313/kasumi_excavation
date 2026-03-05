import type { BlockColor, Direction } from "../types";

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

const COLOR_KEYS: Record<string, BlockColor> = {
  "1": "RED",
  "2": "BLUE",
  "3": "GREEN",
  "4": "YELLOW"
};

export class Input {
  private readonly queue: Direction[] = [];
  private readonly colorQueue: BlockColor[] = [];
  private restartRequested = false;
  private castRequested = false;
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
    this.colorQueue.length = 0;
    this.restartRequested = false;
    this.castRequested = false;
  }

  consumeDirection(): Direction | null {
    return this.queue.shift() ?? null;
  }

  consumeSelectColor(): BlockColor | null {
    return this.colorQueue.shift() ?? null;
  }

  consumeCastAbility(): boolean {
    const value = this.castRequested;
    this.castRequested = false;
    return value;
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

    if (key === "q") {
      this.castRequested = true;
      event.preventDefault();
      return;
    }

    const selectedColor = COLOR_KEYS[key];
    if (selectedColor) {
      if (this.colorQueue.length < 4) {
        this.colorQueue.push(selectedColor);
      }
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