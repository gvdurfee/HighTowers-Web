/** Generate a UUID v4 for new records */
export function generateId(): string {
  return crypto.randomUUID()
}
