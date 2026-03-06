import "./style.css";
import { FIXED_TIMESTEP, MAX_FRAME_DELTA } from "./game/constants";
import { Game } from "./game/Game";
import { CanvasRenderer } from "./game/render/CanvasRenderer";

function requiredById<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required element: ${id}`);
  }
  return node as T;
}

const lobbyScreen = requiredById<HTMLDivElement>("lobby-screen");
const gameScreen = requiredById<HTMLDivElement>("game-screen");
const btnSingle = requiredById<HTMLButtonElement>("btn-single");
const btnMulti = requiredById<HTMLButtonElement>("btn-multi");
const btnSettings = requiredById<HTMLButtonElement>("btn-settings");
const btnBackLobby = requiredById<HTMLButtonElement>("btn-back-lobby");

const settingsOverlay = requiredById<HTMLDivElement>("settings-overlay");
const settingsBackdrop = requiredById<HTMLDivElement>("settings-backdrop");
const settingsClose = requiredById<HTMLButtonElement>("settings-close");
const optBgm = requiredById<HTMLInputElement>("opt-bgm");
const optSfx = requiredById<HTMLInputElement>("opt-sfx");
const optVoice = requiredById<HTMLInputElement>("opt-voice");
const optVibrationOn = requiredById<HTMLInputElement>("opt-vibration-on");
const optVibrationOff = requiredById<HTMLInputElement>("opt-vibration-off");

const canvas = requiredById<HTMLCanvasElement>("game-canvas");
const hpHearts = requiredById<HTMLDivElement>("hp-hearts");
const depthValue = requiredById<HTMLSpanElement>("depth-value");
const bestValue = requiredById<HTMLSpanElement>("best-value");
const fuelFill = requiredById<HTMLDivElement>("fuel-fill");
const comboFill = requiredById<HTMLDivElement>("combo-fill");
const chainValue = requiredById<HTMLSpanElement>("chain-value");
const restartButton = requiredById<HTMLButtonElement>("restart-btn");

const renderer = new CanvasRenderer(canvas);
const game = new Game(renderer, {
  hpHearts,
  depthValue,
  bestValue,
  fuelFill,
  comboFill,
  chainValue,
  restartButton
});

enum UIScreen {
  LOBBY,
  GAME
}

const SETTINGS_BGM_KEY = "kasumi_excavation.settings.bgm";
const SETTINGS_SFX_KEY = "kasumi_excavation.settings.sfx";
const SETTINGS_VOICE_KEY = "kasumi_excavation.settings.voice";
const SETTINGS_VIBRATION_KEY = "kasumi_excavation.settings.vibration";

let activeScreen: UIScreen = UIScreen.LOBBY;
let last = performance.now();
let accumulator = 0;

initializeSettings();
showScreen(UIScreen.LOBBY);

restartButton.addEventListener("click", () => {
  game.restart();
});

btnSingle.addEventListener("click", () => {
  showScreen(UIScreen.GAME);
  game.restart();
});

btnMulti.addEventListener("click", () => {
  window.alert("Coming soon");
});

btnBackLobby.addEventListener("click", () => {
  showScreen(UIScreen.LOBBY);
  closeSettings();
});

btnSettings.addEventListener("click", () => {
  openSettings();
});

settingsClose.addEventListener("click", () => {
  closeSettings();
});

settingsBackdrop.addEventListener("click", () => {
  closeSettings();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsOverlay.hidden) {
    closeSettings();
  }
});

function frame(now: number): void {
  if (activeScreen !== UIScreen.GAME) {
    requestAnimationFrame(frame);
    return;
  }

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

function showScreen(screen: UIScreen): void {
  activeScreen = screen;
  lobbyScreen.hidden = screen !== UIScreen.LOBBY;
  gameScreen.hidden = screen !== UIScreen.GAME;
  last = performance.now();
  accumulator = 0;
}

function openSettings(): void {
  settingsOverlay.hidden = false;
}

function closeSettings(): void {
  settingsOverlay.hidden = true;
}

function initializeSettings(): void {
  optBgm.value = String(loadNumber(SETTINGS_BGM_KEY, 70));
  optSfx.value = String(loadNumber(SETTINGS_SFX_KEY, 75));
  optVoice.value = String(loadNumber(SETTINGS_VOICE_KEY, 65));
  const vibrationEnabled = loadBoolean(SETTINGS_VIBRATION_KEY, true);
  optVibrationOn.checked = vibrationEnabled;
  optVibrationOff.checked = !vibrationEnabled;

  optBgm.addEventListener("input", () => {
    localStorage.setItem(SETTINGS_BGM_KEY, optBgm.value);
  });

  optSfx.addEventListener("input", () => {
    localStorage.setItem(SETTINGS_SFX_KEY, optSfx.value);
  });

  optVoice.addEventListener("input", () => {
    localStorage.setItem(SETTINGS_VOICE_KEY, optVoice.value);
  });

  optVibrationOn.addEventListener("change", () => {
    if (optVibrationOn.checked) {
      localStorage.setItem(SETTINGS_VIBRATION_KEY, "true");
    }
  });

  optVibrationOff.addEventListener("change", () => {
    if (optVibrationOff.checked) {
      localStorage.setItem(SETTINGS_VIBRATION_KEY, "false");
    }
  });
}

function loadBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return raw === "true";
}

function loadNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
