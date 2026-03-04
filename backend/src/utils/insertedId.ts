export const resolveInsertedId = (insertResult: unknown): number | null => {
  if (typeof insertResult === 'number' && Number.isFinite(insertResult)) {
    return insertResult;
  }

  if (typeof insertResult === 'string' && insertResult.trim().length > 0) {
    const parsed = Number(insertResult);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (Array.isArray(insertResult)) {
    const [firstValue] = insertResult;

    if (typeof firstValue === 'number' && Number.isFinite(firstValue)) {
      return firstValue;
    }

    if (typeof firstValue === 'string' && firstValue.trim().length > 0) {
      const parsed = Number(firstValue);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (firstValue && typeof firstValue === 'object' && 'id' in firstValue) {
      const candidate = (firstValue as { id?: unknown }).id;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        const parsed = Number(candidate);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
  }

  if (insertResult && typeof insertResult === 'object' && 'insertId' in insertResult) {
    const candidate = (insertResult as { insertId?: unknown }).insertId;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
};
