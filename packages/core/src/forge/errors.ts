/**
 * @fileoverview Foundation-layer Forge errors.
 */

/**
 * Raised when external data violates a Forge foundation contract.
 */
export class ForgeValidationError extends Error {
  override readonly name = 'ForgeValidationError'

  constructor(message: string) {
    super(message)
  }
}
