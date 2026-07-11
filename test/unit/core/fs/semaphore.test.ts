import { describe, expect, it } from "vitest";
import { ScanIoSemaphore } from "../../../../src/core/fs/semaphore.js";

describe("ScanIoSemaphore", () => {
  it("does not allow new callers to steal a released permit from queued waiters", async () => {
    const semaphore = new ScanIoSemaphore(1);
    const releaseFirst = await semaphore.acquire();
    const order: string[] = [];
    const queued = semaphore.run(async () => { order.push("queued"); });
    releaseFirst();
    await semaphore.run(async () => { order.push("new"); });
    await queued;
    expect(order).toEqual(["queued", "new"]);
    expect(semaphore.inFlight).toBe(0);
  });
});
