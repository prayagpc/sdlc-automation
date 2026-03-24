export function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function splitCsv(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeInlineText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeMultilineText(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  const normalizedLines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .map((line) => line.replace(/[ \t]{2,}/g, ' '));

  const collapsed = [];
  for (const line of normalizedLines) {
    const isBlank = line.trim() === '';
    const previousBlank = collapsed.length > 0 && collapsed[collapsed.length - 1] === '';
    if (isBlank && previousBlank) continue;
    collapsed.push(isBlank ? '' : line);
  }

  return collapsed.join('\n').trim();
}

export function normalizeLabelList(labels) {
  const values = Array.isArray(labels) ? labels : [];
  const seen = new Set();
  const result = [];

  for (const label of values) {
    const cleaned = normalizeInlineText(label);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

export function normalizeStringList(values) {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];

  for (const value of list) {
    const cleaned = normalizeInlineText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}
