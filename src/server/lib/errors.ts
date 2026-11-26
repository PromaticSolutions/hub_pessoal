export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'SCHEMA_TOO_NEW'
  | 'INVALID_BACKUP'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'INTERNAL'

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
  }
}
