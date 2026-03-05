import type { Block, BlockType, FallingMember } from "../types";

export function createBlock(type: BlockType): Block {
  switch (type) {
    case "BASIC":
      return makeStaticBlock(type, 1);
    case "STURDY":
      return makeStaticBlock(type, 2);
    case "UNBREAKABLE":
      return makeStaticBlock(type, null);
    case "EVENT":
      return {
        ...makeStaticBlock(type, 1),
        eventId: "placeholder_event"
      };
    default:
      return makeStaticBlock("BASIC", 1);
  }
}

export function fromFallingMember(source: FallingMember): Block {
  return {
    type: source.type,
    hp: source.hp,
    eventId: source.eventId,
    fallState: "STATIC",
    shakeTimer: 0,
    vy: 0,
    yFloat: 0
  };
}

function makeStaticBlock(type: BlockType, hp: number | null): Block {
  return {
    type,
    hp,
    fallState: "STATIC",
    shakeTimer: 0,
    vy: 0,
    yFloat: 0
  };
}
