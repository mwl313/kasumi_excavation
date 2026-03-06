import { pickRandomBlockColor } from "../colors";
import type { Block, BlockColor, BlockType, FallingMember } from "../types";

export function createBlock(type: BlockType, color?: BlockColor): Block {
  switch (type) {
    case "BASIC":
      return makeStaticBlock(type, 1, color ?? pickRandomBlockColor());
    case "STURDY":
      return makeStaticBlock(type, 2, color ?? pickRandomBlockColor());
    case "UNBREAKABLE":
      return {
        ...makeStaticBlock(type, null),
        cracked: false
      };
    case "EVENT":
      return {
        ...makeStaticBlock(type, 1),
        eventId: "placeholder_event"
      };
    default:
      return makeStaticBlock("BASIC", 1, color ?? pickRandomBlockColor());
  }
}

export function fromFallingMember(source: FallingMember): Block {
  return {
    type: source.type,
    hp: source.hp,
    color: source.color,
    cracked: source.cracked,
    eventId: source.eventId,
    fallState: "STATIC",
    shakeTimer: 0,
    vy: 0,
    yFloat: 0
  };
}

function makeStaticBlock(type: BlockType, hp: number | null, color?: BlockColor): Block {
  return {
    type,
    hp,
    color,
    fallState: "STATIC",
    shakeTimer: 0,
    vy: 0,
    yFloat: 0
  };
}
