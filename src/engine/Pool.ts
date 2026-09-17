/**
 * Fixed-growth object pool. Projectiles, damage numbers and particles churn
 * hard during combat; pooling keeps the GC quiet on mid-range Android, which is
 * where dropped frames show up first.
 */
export class Pool<T> {
  private free: T[] = [];
  private readonly create: () => T;
  private readonly reset: (item: T) => void;

  constructor(create: () => T, reset: (item: T) => void, prefill = 0) {
    this.create = create;
    this.reset = reset;
    for (let i = 0; i < prefill; i++) this.free.push(create());
  }

  acquire(): T {
    const item = this.free.pop();
    return item ?? this.create();
  }

  release(item: T): void {
    this.reset(item);
    this.free.push(item);
  }

  get available(): number {
    return this.free.length;
  }
}
