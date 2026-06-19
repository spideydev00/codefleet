/**
 * @fileoverview Small FIFO semaphore for bounded asynchronous work.
 */

/**
 * Bounds concurrent operations and releases waiters in arrival order.
 */
export class Semaphore {
  private available: number
  private readonly waiters: Array<() => void> = []

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('Semaphore maximum must be a positive integer')
    }
    this.available = maximum
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1
      return
    }

    await new Promise<void>(resolve => {
      this.waiters.push(resolve)
    })
  }

  release(): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter()
      return
    }

    if (this.available >= this.maximum) {
      throw new Error('Semaphore released without a matching acquire')
    }
    this.available += 1
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await operation()
    } finally {
      this.release()
    }
  }
}
