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
const gameShellNode = gameScreen.querySelector(".game-shell");
if (!gameShellNode) {
  throw new Error("Missing required element: .game-shell");
}
const gameShell = gameShellNode as HTMLDivElement;
const touchArea = requiredById<HTMLDivElement>("touch-area");
const btnSingle = requiredById<HTMLButtonElement>("btn-single");
const btnMulti = requiredById<HTMLButtonElement>("btn-multi");
const btnSettings = requiredById<HTMLButtonElement>("btn-settings");
const btnTopLobby = requiredById<HTMLButtonElement>("btn-top-lobby");
const btnTopSettings = requiredById<HTMLButtonElement>("btn-top-settings");

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
}, {
  touchArea
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
let paused = false;
let last = performance.now();
let accumulator = 0;

initializeSettings();
showScreen(UIScreen.LOBBY);
fitGameShellToViewport();

restartButton.addEventListener("click", () => {
  game.restart();
});

btnSingle.addEventListener("click", () => {
  paused = false;
  game.setPaused(false);
  showScreen(UIScreen.GAME);
  game.restart();
});

btnMulti.addEventListener("click", () => {
  window.alert("Coming soon");
});

btnTopLobby.addEventListener("click", () => {
  closeSettings();
  paused = false;
  game.setPaused(false);
  showScreen(UIScreen.LOBBY);
});

btnSettings.addEventListener("click", () => {
  openSettings({ pauseGame: false });
});

btnTopSettings.addEventListener("click", () => {
  openSettings({ pauseGame: true });
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

window.addEventListener("resize", () => {
  requestAnimationFrame(fitGameShellToViewport);
});

window.addEventListener("orientationchange", () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitGameShellToViewport);
  });
});

function frame(now: number): void {
  if (activeScreen !== UIScreen.GAME) {
    requestAnimationFrame(frame);
    return;
  }

  if (paused) {
    last = now;
    accumulator = 0;
    game.render();
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

  if (screen === UIScreen.GAME) {
    requestAnimationFrame(() => fitGameShellToViewport());
  } else {
    gameShell.style.transform = "";
    gameShell.style.transformOrigin = "";
    gameShell.style.left = "";
    gameShell.style.position = "";
    gameShell.style.margin = "";
  }
}

function openSettings(options: { pauseGame: boolean }): void {
  settingsOverlay.hidden = false;
  if (options.pauseGame && activeScreen === UIScreen.GAME) {
    paused = true;
    game.setPaused(true);
  }
  requestAnimationFrame(fitGameShellToViewport);
}

function closeSettings(): void {
  const wasVisible = !settingsOverlay.hidden;
  settingsOverlay.hidden = true;
  if (wasVisible && activeScreen === UIScreen.GAME) {
    paused = false;
    game.setPaused(false);
    last = performance.now();
    accumulator = 0;
  }
  requestAnimationFrame(fitGameShellToViewport);
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

function fitGameShellToViewport(): void {
  if (activeScreen !== UIScreen.GAME) {
    return;
  }
  if (gameScreen.hidden) {
    return;
  }

  const viewportW = window.visualViewport?.width ?? window.innerWidth;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  const bodyStyles = window.getComputedStyle(document.body);
  const padX = parseFloat(bodyStyles.paddingLeft) || 8;
  const padY = parseFloat(bodyStyles.paddingTop) || 8;

  gameShell.style.position = "relative";
  gameShell.style.left = "50%";
  gameShell.style.margin = "0";
  gameShell.style.transformOrigin = "top center";
  gameShell.style.transform = "translateX(-50%) scale(1)";

  const rect = gameShell.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const availableW = Math.max(0, viewportW - padX * 2);
  const availableH = Math.max(0, viewportH - padY * 2);

  const scaleX = availableW / rect.width;
  const scaleY = availableH / rect.height;
  const scale = Math.min(scaleX, scaleY, 1);

  gameShell.style.transformOrigin = "top center";
  gameShell.style.transform = `translateX(-50%) scale(${scale})`;
}
