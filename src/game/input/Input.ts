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
  private enabled = true;
  private readonly swipeElement?: HTMLElement;
  private activePointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private readonly onKeyDownBound: (event: KeyboardEvent) => void;
  private readonly onPointerDownBound: (event: PointerEvent) => void;
  private readonly onPointerUpBound: (event: PointerEvent) => void;
  private readonly onPointerCancelBound: (event: PointerEvent) => void;

  constructor(swipeElement?: HTMLElement) {
    this.swipeElement = swipeElement;
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onPointerCancelBound = this.onPointerCancel.bind(this);
    window.addEventListener("keydown", this.onKeyDownBound);

    if (this.swipeElement) {
      this.swipeElement.addEventListener("pointerdown", this.onPointerDownBound);
      this.swipeElement.addEventListener("pointerup", this.onPointerUpBound);
      this.swipeElement.addEventListener("pointercancel", this.onPointerCancelBound);
    }
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDownBound);
    if (this.swipeElement) {
      this.swipeElement.removeEventListener("pointerdown", this.onPointerDownBound);
      this.swipeElement.removeEventListener("pointerup", this.onPointerUpBound);
      this.swipeElement.removeEventListener("pointercancel", this.onPointerCancelBound);
    }
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

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.clear();
      this.resetSwipeState();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) {
      return;
    }

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

    this.enqueueDirection(direction);
    event.preventDefault();
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.enabled) {
      return;
    }
    if (this.activePointerId !== null) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (this.shouldIgnoreSwipeTarget(event.target)) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.swipeElement?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.enabled) {
      return;
    }
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    this.resetSwipeState();

    if (absX < 24 && absY < 24) {
      return;
    }

    let direction: Direction;
    if (absX > absY) {
      direction = dx > 0 ? "RIGHT" : "LEFT";
    } else {
      direction = dy > 0 ? "DOWN" : "UP";
    }

    this.enqueueDirection(direction);
    event.preventDefault();
  }

  private onPointerCancel(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    this.resetSwipeState();
  }

  private enqueueDirection(direction: Direction): void {
    if (this.queue.length < 8) {
      this.queue.push(direction);
    }
  }

  private shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    return !!target.closest(
      "button,input,select,textarea,label,a,[role='button'],#settings-overlay,.overlay-panel"
    );
  }

  private resetSwipeState(): void {
    this.activePointerId = null;
    this.startX = 0;
    this.startY = 0;
  }
}
