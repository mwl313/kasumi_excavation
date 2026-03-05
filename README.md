# Kasumi Excavation Prototype

Single-player endless 7-column dig/jump prototype built with TypeScript + Vite + Canvas 2D.

## Run

```bash
npm install
npm run dev
```

## Controls

- Move / Mine: Arrow keys or `WASD`
- Jump / Up mining: `ArrowUp` or `W`
- Restart: `R` or restart button on game over

## Architecture (short)

- `src/main.ts`: app bootstrap + fixed timestep loop
- `src/game/Game.ts`: gameplay orchestration (input, player actions, gravity, world updates, HUD)
- `src/game/world/World.ts`: static grid, chunk generation integration, instability/shaking handling, pruning
- `src/game/world/ChunkGen.ts`: seed-based deterministic chunk/row generation with anti-softlock empty cell guarantee
- `src/game/systems/FallingBlocks.ts`: falling physics, landing snap, player hit/push + i-frames
- `src/game/render/Renderer.ts`: Canvas rendering for tiles, falling blocks, player triangle, game-over overlay
- `src/game/input/Input.ts`: keyboard input queue (`arrows` + `WASD`) + restart key

## Notes

- `bestDepth` is persisted in `localStorage`.
- Open-question defaults from the spec are applied:
  - Up mining breaks and moves upward on break.
  - Down input in air is ignored.
  - If both push sides are blocked, only HP decreases.
  - Unbreakable blocks can also become unstable and fall.
  - Player gravity uses tile-step timer.