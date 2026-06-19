/**
 * @fileoverview Tests for guaranteed Forge resource teardown.
 */

import { describe, expect, it } from 'vitest'
import {
  withGuaranteedCleanup,
  type Cleanable,
} from '../../src/forge/cleanup/cleanup.js'

describe('withGuaranteedCleanup', () => {
  it('cleans exactly once on success and returns the operation value', async () => {
    let cleanupCalls = 0
    const target: Cleanable = {
      async cleanupAll() {
        cleanupCalls += 1
      },
    }

    const value = await withGuaranteedCleanup(target, async () => 'result')

    expect(value).toBe('result')
    expect(cleanupCalls).toBe(1)
  })

  it('preserves the original operation error when cleanup also rejects', async () => {
    const original = new Error('operation failed')
    let cleanupCalls = 0
    const target: Cleanable = {
      async cleanupAll() {
        cleanupCalls += 1
        throw new Error('cleanup failed')
      },
    }

    const operation = withGuaranteedCleanup(target, async () => {
      throw original
    })

    await expect(operation).rejects.toBe(original)
    expect(cleanupCalls).toBe(1)
  })

  it('does not clean when keep is enabled', async () => {
    let cleanupCalls = 0
    const target: Cleanable = {
      async cleanupAll() {
        cleanupCalls += 1
      },
    }

    const value = await withGuaranteedCleanup(
      target,
      async () => 42,
      { keep: true },
    )

    expect(value).toBe(42)
    expect(cleanupCalls).toBe(0)
  })

  it('returns a successful value even if cleanup unexpectedly rejects', async () => {
    const target: Cleanable = {
      async cleanupAll() {
        throw new Error('cleanup failed')
      },
    }

    await expect(
      withGuaranteedCleanup(target, async () => 'result'),
    ).resolves.toBe('result')
  })
})
