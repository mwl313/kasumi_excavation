import { BLOCK_GRAVITY, BLOCK_MAX_VY } from "../constants";
import { fromFallingMember } from "../entities/Block";
import { Player } from "../entities/Player";
import type { Direction, FallingGroup } from "../types";
import { World } from "../world/World";

interface FallingGroupUpdateOptions {
  consumeShieldHit: () => boolean;
}

export function updateFallingGroups(
  world: World,
  player: Player,
  dt: number,
  options: FallingGroupUpdateOptions
): void {
  if (player.ridingGroupId === null && player.isGrounded) {
    const support = world.getSupportingFallingGroupUnderPlayer(player.x, player.y);
    if (support) {
      player.ridingGroupId = support.groupId;
    }
  }

  const nextGroups: FallingGroup[] = [];

  for (const group of world.fallingGroups) {
    if (group.state !== "FALLING") {
      nextGroups.push(group);
      continue;
    }

    const oldBaseY = group.yFloat;
    group.vy = Math.min(BLOCK_MAX_VY, group.vy + BLOCK_GRAVITY * dt);
    const targetBaseY = oldBaseY + group.vy * dt;

    const landing = resolveGroupMovement(world, group, oldBaseY, targetBaseY);
    group.yFloat = landing.resolvedBaseY;

    if (player.ridingGroupId === group.id) {
      snapPlayerOnRidingGroup(player, group);
      player.setGrounded();
    }

    applyFallingGroupDamage(world, player, group, oldBaseY, options);

    if (landing.landed) {
      landGroup(world, player, group);
      if (player.ridingGroupId === group.id) {
        player.ridingGroupId = null;
      }
      continue;
    }

    nextGroups.push(group);
  }

  world.replaceFallingGroups(nextGroups);

  if (player.ridingGroupId !== null) {
    const support = world.getSupportingFallingGroupUnderPlayer(player.x, player.y);
    if (!support || support.groupId !== player.ridingGroupId) {
      player.ridingGroupId = null;
    }
  }
}

function resolveGroupMovement(
  world: World,
  group: FallingGroup,
  currentBaseY: number,
  targetBaseY: number
): { landed: boolean; resolvedBaseY: number } {
  let landed = false;
  let resolvedBaseY = targetBaseY;

  for (const member of group.members) {
    const currentMemberY = currentBaseY + member.yOffset;
    const targetMemberY = targetBaseY + member.yOffset;
    const currentCellY = Math.floor(currentMemberY);
    const targetCellY = Math.floor(targetMemberY);

    if (targetCellY <= currentCellY) {
      continue;
    }

    for (let candidateY = currentCellY + 1; candidateY <= targetCellY; candidateY += 1) {
      if (!world.isStaticCellEmpty(member.x, candidateY + 1)) {
        landed = true;
        const memberAllowedBase = candidateY - member.yOffset;
        resolvedBaseY = Math.min(resolvedBaseY, memberAllowedBase);
        break;
      }
    }
  }

  if (landed) {
    return { landed: true, resolvedBaseY: Math.floor(resolvedBaseY) };
  }

  return { landed: false, resolvedBaseY };
}

function snapPlayerOnRidingGroup(player: Player, group: FallingGroup): void {
  let topY: number | null = null;
  for (const member of group.members) {
    if (member.x !== player.x) {
      continue;
    }
    const cellY = Math.round(group.yFloat + member.yOffset);
    if (topY === null || cellY < topY) {
      topY = cellY;
    }
  }

  if (topY !== null) {
    player.y = topY - 1;
  }
}

function applyFallingGroupDamage(
  world: World,
  player: Player,
  group: FallingGroup,
  oldBaseY: number,
  options: FallingGroupUpdateOptions
): void {
  if (player.ridingGroupId === group.id) {
    return;
  }

  for (const member of group.members) {
    if (member.x !== player.x) {
      continue;
    }

    const prevCellY = Math.round(oldBaseY + member.yOffset);
    const currentCellY = Math.round(group.yFloat + member.yOffset);
    const crossedPlayer =
      currentCellY === player.y || (prevCellY < player.y && currentCellY >= player.y);

    if (!crossedPlayer) {
      continue;
    }

    const shieldBlocked = options.consumeShieldHit();
    if (shieldBlocked) {
      return;
    }

    const gotHit = player.tryDamage(1);
    if (!gotHit) {
      return;
    }

    const pushDirection = resolvePushDirection(player.facing, player.x, player.y, world);
    if (pushDirection !== 0) {
      player.x += pushDirection;
    }

    const support = world.getSupportingFallingGroupUnderPlayer(player.x, player.y);
    if (support) {
      player.ridingGroupId = support.groupId;
      player.setGrounded();
    } else if (world.isStaticCellEmpty(player.x, player.y + 1)) {
      player.ridingGroupId = null;
      player.setAirborne();
    } else {
      player.ridingGroupId = null;
      player.setGrounded();
    }

    return;
  }
}

function landGroup(world: World, player: Player, group: FallingGroup): void {
  const baseY = Math.round(group.yFloat);

  if (player.ridingGroupId === group.id) {
    snapPlayerOnRidingGroup(player, group);
    player.setGrounded();
  }

  for (const member of group.members) {
    const y = baseY + member.yOffset;
    if (player.x === member.x && player.y === y) {
      continue;
    }
    world.setBlock(member.x, y, fromFallingMember(member));
  }
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
