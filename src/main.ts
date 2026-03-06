import "./style.css";
import { FIXED_TIMESTEP, MAX_FRAME_DELTA } from "./game/constants";
import { Game } from "./game/Game";

function requiredById<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required element: ${id}`);
  }
  return node as T;
}

const canvas = requiredById<HTMLCanvasElement>("game-canvas");
const hpValue = requiredById<HTMLSpanElement>("hp-value");
const depthValue = requiredById<HTMLSpanElement>("depth-value");
const bestValue = requiredById<HTMLSpanElement>("best-value");
const fuelValue = requiredById<HTMLSpanElement>("fuel-value");
const fuelFill = requiredById<HTMLDivElement>("fuel-fill");
const comboValue = requiredById<HTMLSpanElement>("combo-value");
const comboFill = requiredById<HTMLDivElement>("combo-fill");
const chainValue = requiredById<HTMLSpanElement>("chain-value");
const modeValue = requiredById<HTMLSpanElement>("mode-value");
const restartButton = requiredById<HTMLButtonElement>("restart-btn");

const game = new Game(canvas, {
  hpValue,
  depthValue,
  bestValue,
  fuelValue,
  fuelFill,
  comboValue,
  comboFill,
  chainValue,
  modeValue,
  restartButton
});

restartButton.addEventListener("click", () => {
  game.restart();
});

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const delta = Math.min((now - last) / 1000, MAX_FRAME_DELTA);
  last = now;
  accumulator += delta;

  while (accumulator >= FIXED_TIMESTEP) {
    game.update(FIXED_TIMESTEP);
    accumulator -= FIXED_TIMESTEP;
  }

  game.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
