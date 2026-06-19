/**
 * @fileoverview Tests for the FIFO asynchronous semaphore.
 */

import { describe, expect, it } from 'vitest'
import { Semaphore } from '../../src/forge/engine/concurrency.js'

describe('Semaphore', () => {
  it('bounds concurrent operations', async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0

    await Promise.all(Array.from({ length: 6 }, async () => {
      await semaphore.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
      })
    }))

    expect(peak).toBe(2)
  })

  it('releases waiters in FIFO order without deadlocking', async () => {
    const semaphore = new Semaphore(1)
    const order: number[] = []
    await semaphore.acquire()

    const waiters = [1, 2, 3].map(async value => {
      await semaphore.acquire()
      order.push(value)
      semaphore.release()
    })

    semaphore.release()
    await Promise.all(waiters)

    expect(order).toEqual([1, 2, 3])
  })

  it('rejects unbalanced releases', () => {
    const semaphore = new Semaphore(1)
    expect(() => semaphore.release()).toThrow('matching acquire')
  })
})
