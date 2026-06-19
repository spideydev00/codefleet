/**
 * @fileoverview Foundation-layer CodeFleet errors.
 */

/**
 * Raised when external data violates a CodeFleet foundation contract.
 */
export class CodeFleetValidationError extends Error {
  override readonly name = 'CodeFleetValidationError'

  constructor(message: string) {
    super(message)
  }
}
