export const statuses = ['ok', 'warn', 'error'] as const
export const components = ['datastore', 'cache', 'objectstore', 'email', 'unknown'] as const

export type Status = (typeof statuses)[number]
