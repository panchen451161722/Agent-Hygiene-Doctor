export type BudgetKind = "files" | "bytes" | "depth" | "entries" | "roots" | "artifacts";
export class RootBudget {
  private readonly used = new Map<BudgetKind, number>();
  private readonly exhausted = new Set<BudgetKind>();
  constructor(readonly limits: Readonly<Partial<Record<BudgetKind, number>>>) {}
  spend(kind: BudgetKind, amount = 1): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (this.exhausted.has(kind)) return false;
    if (!this.check(kind, (this.used.get(kind) ?? 0) + amount)) return false;
    this.used.set(kind, (this.used.get(kind) ?? 0) + amount);
    return true;
  }
  check(kind: BudgetKind, amount = 1): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (this.exhausted.has(kind)) return false;
    const limit = this.limits[kind];
    if (limit !== undefined && amount > limit) { this.exhausted.add(kind); return false; }
    return true;
  }
  remaining(kind: BudgetKind): number {
    if (this.exhausted.has(kind)) return 0;
    const limit = this.limits[kind];
    if (limit === undefined) return Number.POSITIVE_INFINITY;
    return Math.max(0, limit - (this.used.get(kind) ?? 0));
  }
  getUsed(kind: BudgetKind): number { return this.used.get(kind) ?? 0; }
  isExhausted(kind: BudgetKind): boolean { return this.exhausted.has(kind); }
}
export class AdapterBudget extends RootBudget {}