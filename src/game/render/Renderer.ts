import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TILE_SIZE,
  WORLD_WIDTH
} from "../constants";
import { Player } from "../entities/Player";
import type { Block, BlockColor, Direction } from "../types";
import { World } from "../world/World";

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is unavailable.");
    }
    this.ctx = ctx;
  }

  render(world: World, player: Player, gameOver: boolean, cameraY: number): void {
    const visibleRows = Math.ceil(this.canvas.height / TILE_SIZE) + 3;
    const minY = Math.floor(cameraY) - 1;
    const maxY = minY + visibleRows;
    const now = performance.now();

    this.drawBackground();
    this.drawGrid(cameraY);

    const staticBlocks = world.getStaticBlocksInRange(minY, maxY);
    for (const snapshot of staticBlocks) {
      this.drawBlock(snapshot.block, snapshot.x, snapshot.y, cameraY, now, false);
    }

    for (const group of world.fallingGroups) {
      if (group.state !== "FALLING") {
        continue;
      }
      for (const member of group.members) {
        const memberY = group.yFloat + member.yOffset;
        if (memberY < minY - 1 || memberY > maxY + 1) {
          continue;
        }
        const asBlock: Block = {
          type: member.type,
          hp: member.hp,
          color: member.color,
          eventId: member.eventId,
          fallState: "FALLING",
          shakeTimer: 0,
          vy: group.vy,
          yFloat: memberY
        };
        this.drawBlock(asBlock, member.x, memberY, cameraY, now, true);
      }
    }

    this.drawPlayer(player, cameraY, now);

    if (gameOver) {
      this.drawGameOverOverlay();
    }
  }

  private drawBackground(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#0f1722");
    gradient.addColorStop(1, "#05080d");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawGrid(cameraY: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(180, 210, 240, 0.06)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= WORLD_WIDTH; x += 1) {
      const sx = x * TILE_SIZE + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.canvas.height);
      ctx.stroke();
    }

    const rows = Math.ceil(this.canvas.height / TILE_SIZE) + 2;
    const startY = Math.floor(cameraY);
    for (let r = 0; r <= rows; r += 1) {
      const sy = Math.round((startY + r - cameraY) * TILE_SIZE) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.canvas.width, sy);
      ctx.stroke();
    }
  }

  private drawBlock(
    block: Block,
    x: number,
    y: number,
    cameraY: number,
    nowMs: number,
    isFalling: boolean
  ): void {
    const ctx = this.ctx;
    const baseX = x * TILE_SIZE;
    const baseY = Math.round((y - cameraY) * TILE_SIZE);
    const jitter =
      block.fallState === "SHAKING" ? Math.sin(nowMs * 0.08 + x * 5 + y * 3) * 2 : 0;
    const drawX = Math.round(baseX + jitter);
    const drawY = baseY;
    const color = this.blockColor(block, isFalling);

    ctx.fillStyle = color;
    ctx.fillRect(drawX + 1, drawY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    if (block.type === "STURDY" && block.hp === 1) {
      ctx.strokeStyle = "#d8e0e8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(drawX + TILE_SIZE * 0.25, drawY + TILE_SIZE * 0.25);
      ctx.lineTo(drawX + TILE_SIZE * 0.75, drawY + TILE_SIZE * 0.6);
      ctx.lineTo(drawX + TILE_SIZE * 0.45, drawY + TILE_SIZE * 0.82);
      ctx.stroke();
    }

    if (block.type === "EVENT") {
      ctx.fillStyle = "#fff8bf";
      ctx.beginPath();
      ctx.arc(
        drawX + TILE_SIZE * 0.5,
        drawY + TILE_SIZE * 0.5,
        TILE_SIZE * 0.14,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  private drawPlayer(player: Player, cameraY: number, nowMs: number): void {
    const ctx = this.ctx;
    const cx = player.renderX * TILE_SIZE + TILE_SIZE * 0.5;
    const cy = (player.renderY - cameraY) * TILE_SIZE + TILE_SIZE * 0.5;

    const flicker =
      player.iFrameTimer > 0 ? (Math.floor(nowMs / 60) % 2 === 0 ? 0.35 : 0.75) : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotationForFacing(player.facing));
    ctx.globalAlpha = flicker;
    ctx.fillStyle = "#8ef0ff";
    ctx.beginPath();
    ctx.moveTo(0, -TILE_SIZE * 0.32);
    ctx.lineTo(TILE_SIZE * 0.29, TILE_SIZE * 0.27);
    ctx.lineTo(-TILE_SIZE * 0.29, TILE_SIZE * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGameOverOverlay(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 34px Segoe UI";
    ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 10);
    ctx.font = "16px Segoe UI";
    ctx.fillText("Press R to restart", this.canvas.width / 2, this.canvas.height / 2 + 24);
  }

  private rotationForFacing(direction: Direction): number {
    switch (direction) {
      case "UP":
        return 0;
      case "RIGHT":
        return Math.PI / 2;
      case "DOWN":
        return Math.PI;
      case "LEFT":
        return -Math.PI / 2;
      default:
        return 0;
    }
  }

  private blockColor(block: Block, isFalling: boolean): string {
    if ((block.type === "BASIC" || block.type === "STURDY") && block.color) {
      const base = this.baseColorFor(block.color);
      const factor =
        block.type === "STURDY" ? (isFalling ? 0.6 : 0.72) : isFalling ? 0.84 : 1;
      return this.adjustHexBrightness(base, factor);
    }

    switch (block.type) {
      case "BASIC":
        return isFalling ? "#9aa6b3" : "#7e8b98";
      case "STURDY":
        return isFalling ? "#6b7d9b" : "#586980";
      case "UNBREAKABLE":
        return isFalling ? "#3f4953" : "#222b34";
      case "EVENT":
        return isFalling ? "#e1b750" : "#c9982f";
      default:
        return "#7e8b98";
    }
  }

  private baseColorFor(color: BlockColor): string {
    switch (color) {
      case "RED":
        return "#c85b5b";
      case "BLUE":
        return "#4f84c6";
      case "GREEN":
        return "#56b07f";
      case "YELLOW":
        return "#d3b85a";
      default:
        return "#7e8b98";
    }
  }

  private adjustHexBrightness(hex: string, factor: number): string {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);

    const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
    const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
    const nb = Math.max(0, Math.min(255, Math.round(b * factor)));

    return `#${nr.toString(16).padStart(2, "0")}${ng
      .toString(16)
      .padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  }
}
