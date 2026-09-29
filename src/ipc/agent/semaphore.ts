/**
 * A small counting semaphore used to bound concurrent sub-agent execution.
 *
 * Unlike the previous per-chat mutex (which was acquired but never released,
 * and therefore serialized all sub-agents and deadlocked on the second
 * acquisition), this allows up to `permits` concurrent holders and always
 * releases cleanly via the returned release function.
 *
 * Dependency-free so it can live next to the orchestrator without pulling in
 * Electron, DB, or the AI SDK.
 */
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    if (!Number.isFinite(permits) || permits < 1) {
      throw new Error(`Semaphore requires permits >= 1, got ${permits}`);
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit. Resolves to a release function that MUST be called once
   * (idempotent) when the holder is done. Blocks while no permit is available.
   */
  acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve(this.makeRelease());
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.permits--;
        resolve(this.makeRelease());
      });
    });
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.permits++;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  get availablePermits(): number {
    return this.permits;
  }
}
