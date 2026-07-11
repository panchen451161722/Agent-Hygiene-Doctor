export class ScanIoSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(readonly capacity = 8) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error("AH-INVALID-SEMAPHORE"); }
  get inFlight(): number { return this.active; }
  async acquire(): Promise<() => void> {
    if (this.active < this.capacity) {
      this.active += 1;
      return this.releaseOnce();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    return this.releaseOnce();
  }
  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this.active -= 1;
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try { return await operation(); } finally { release(); }
  }
}