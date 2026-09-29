/** The target documentId of a to-one relation value in Document Service `data`, or null. */
export function relationDocumentId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.documentId === 'string') return record.documentId;
    for (const key of ['connect', 'set'] as const) {
      const list = record[key];
      if (Array.isArray(list) && list.length === 1) return relationDocumentId(list[0]);
    }
  }
  return null;
}
