import { BLOCK_GRAVITY, BLOCK_MAX_VY } from "../constants";
import { Player } from "../entities/Player";
import type { Direction, FallingBlock } from "../types";
import { World } from "../world/World";

export function updateFallingBlocks(world: World, player: Player, dt: number): void {
  const survivors: FallingBlock[] = [];

  for (const block of world.fallingBlocks) {
    block.vy = Math.min(BLOCK_MAX_VY, block.vy + BLOCK_GRAVITY * dt);

    const currentY = block.yFloat;
    const nextY = currentY + block.vy * dt;
    const currentCellY = Math.floor(currentY);
    let landed = false;
    let resolvedY = nextY;

    if (!world.isStaticCellEmpty(block.x, currentCellY + 1)) {
      landed = true;
      resolvedY = currentCellY;
    } else {
      const targetCellY = Math.floor(nextY);
      if (targetCellY > currentCellY) {
        for (let candidateY = currentCellY + 1; candidateY <= targetCellY; candidateY += 1) {
          if (!world.isStaticCellEmpty(block.x, candidateY + 1)) {
            landed = true;
            resolvedY = candidateY;
            break;
          }
        }
      }
    }

    block.yFloat = resolvedY;

    const fallCellY = Math.round(block.yFloat);
    if (block.x === player.x && fallCellY === player.y) {
      const gotHit = player.tryDamage(1);
      if (gotHit) {
        const pushDirection = resolvePushDirection(player.facing, player.x, player.y, world);
        if (pushDirection !== 0) {
          player.x += pushDirection;
        }

        if (world.isStaticCellEmpty(player.x, player.y + 1)) {
          player.setAirborne();
        } else {
          player.setGrounded();
        }
      }
    }

    if (landed) {
      const snappedY = Math.floor(block.yFloat);
      if (!(player.x === block.x && player.y === snappedY)) {
        world.landFallingBlock(block, snappedY);
        continue;
      }
    }

    survivors.push(block);
  }

  world.replaceFallingBlocks(survivors);
}

function resolvePushDirection(
  facing: Direction,
  playerX: number,
  playerY: number,
  world: World
): -1 | 0 | 1 {
  const leftOpen = world.isCellEmpty(playerX - 1, playerY);
  const rightOpen = world.isCellEmpty(playerX + 1, playerY);

  if (leftOpen && !rightOpen) {
    return -1;
  }
  if (!leftOpen && rightOpen) {
    return 1;
  }
  if (!leftOpen && !rightOpen) {
    return 0;
  }

  const preferred = oppositeDirectionHorizontal(facing);
  if (preferred === -1 && leftOpen) {
    return -1;
  }
  if (preferred === 1 && rightOpen) {
    return 1;
  }
  return rightOpen ? 1 : -1;
}

function oppositeDirectionHorizontal(facing: Direction): -1 | 1 {
  if (facing === "LEFT") {
    return 1;
  }
  if (facing === "RIGHT") {
    return -1;
  }
  return 1;
}