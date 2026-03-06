export interface RenderContext {
  nowMs: number;
}

// Future migration path:
// Implement a PixiRenderer that satisfies IRenderer, then switch construction in main.ts.
export interface IRenderer {
  render(game: any, ctx: RenderContext): void;
  destroy?(): void;
}
